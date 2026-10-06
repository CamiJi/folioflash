import { mkdirSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const databasePath = path.join(dataDir, 'folioflash.sqlite');
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      first_generation_used INTEGER NOT NULL DEFAULT 0,
      brief_budget_used_eur REAL NOT NULL DEFAULT 0,
      brief_turns_used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      owner_email TEXT REFERENCES users(email),
      slug TEXT NOT NULL,
      legacy INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sites_one_active_per_account
      ON sites(owner_email) WHERE legacy = 0 AND owner_email IS NOT NULL;
    CREATE TABLE IF NOT EXISTS credits (
      account_email TEXT PRIMARY KEY REFERENCES users(email),
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0)
    );
    CREATE TABLE IF NOT EXISTS magic_links (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL REFERENCES users(email),
      expires_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      site_id TEXT,
      kind TEXT NOT NULL,
      status TEXT,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'stripe',
      provider_id TEXT UNIQUE,
      account_email TEXT NOT NULL REFERENCES users(email),
      status TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'eur',
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_email TEXT NOT NULL REFERENCES users(email),
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference TEXT UNIQUE,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);

  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  if (!userColumns.has('brief_budget_used_eur')) db.exec('ALTER TABLE users ADD COLUMN brief_budget_used_eur REAL NOT NULL DEFAULT 0');
  if (!userColumns.has('brief_turns_used')) db.exec('ALTER TABLE users ADD COLUMN brief_turns_used INTEGER NOT NULL DEFAULT 0');

  const getMetadata = db.prepare('SELECT value FROM metadata WHERE key = ?');
  const setMetadata = db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
  migrateJsonPilotState(db, dataDir, getMetadata, setMetadata);

  function loadState() {
    const users = new Map(db.prepare('SELECT email, created_at, first_generation_used, brief_budget_used_eur, brief_turns_used FROM users')
      .all().map((row) => [row.email, {
        email: row.email,
        createdAt: row.created_at,
        firstGenerationUsed: Boolean(row.first_generation_used),
        briefBudgetUsedEur: row.brief_budget_used_eur,
        briefTurnsUsed: row.brief_turns_used,
      }]));
    const sites = new Map(db.prepare('SELECT id, data FROM sites')
      .all().map((row) => [row.id, parseJson(row.data)]));
    const credits = new Map(db.prepare('SELECT account_email, balance FROM credits')
      .all().map((row) => [row.account_email, row.balance]));
    const magicLinks = new Map(db.prepare('SELECT token_hash, data FROM magic_links')
      .all().map((row) => [row.token_hash, parseJson(row.data)]));
    const sessions = new Map(db.prepare('SELECT token_hash, data FROM sessions')
      .all().map((row) => [row.token_hash, parseJson(row.data)]));
    return { users, sites, credits, magicLinks, sessions };
  }

  function saveState(state) {
    const persist = db.prepare(`INSERT INTO users (email, created_at, first_generation_used, brief_budget_used_eur, brief_turns_used) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET created_at = excluded.created_at, first_generation_used = excluded.first_generation_used, brief_budget_used_eur = excluded.brief_budget_used_eur, brief_turns_used = excluded.brief_turns_used`);
    const insertSite = db.prepare(`INSERT INTO sites (id, owner_email, slug, legacy, data) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET owner_email = excluded.owner_email, slug = excluded.slug, legacy = excluded.legacy, data = excluded.data`);
    const insertCredits = db.prepare(`INSERT INTO credits (account_email, balance) VALUES (?, ?)
      ON CONFLICT(account_email) DO UPDATE SET balance = excluded.balance`);
    const insertMagicLink = db.prepare(`INSERT INTO magic_links (token_hash, email, expires_at, data) VALUES (?, ?, ?, ?)
      ON CONFLICT(token_hash) DO UPDATE SET email = excluded.email, expires_at = excluded.expires_at, data = excluded.data`);
    const insertSession = db.prepare(`INSERT INTO sessions (token_hash, email, expires_at, data) VALUES (?, ?, ?, ?)
      ON CONFLICT(token_hash) DO UPDATE SET email = excluded.email, expires_at = excluded.expires_at, data = excluded.data`);
    const accounts = new Map(state.users);
    for (const site of state.sites.values()) {
      if (site.ownerEmail && !accounts.has(site.ownerEmail)) {
        accounts.set(site.ownerEmail, {
          email: site.ownerEmail,
          createdAt: new Date().toISOString(),
          firstGenerationUsed: site.status === 'live',
          briefBudgetUsedEur: 0,
          briefTurnsUsed: 0,
        });
      }
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [email, user] of accounts) {
        persist.run(email, user.createdAt ?? new Date().toISOString(), Number(Boolean(user.firstGenerationUsed)), Number(user.briefBudgetUsedEur ?? 0), Number(user.briefTurnsUsed ?? 0));
      }
      for (const site of state.sites.values()) {
        insertSite.run(site.id, site.ownerEmail || null, site.slug || site.id, Number(Boolean(site.legacy)), JSON.stringify(site));
      }
      for (const [email, balance] of state.credits) {
        if (accounts.has(email) && balance > 0) insertCredits.run(email, balance);
        else db.prepare('DELETE FROM credits WHERE account_email = ?').run(email);
      }
      for (const [tokenHash, record] of state.magicLinks) {
        insertMagicLink.run(tokenHash, record.email, record.expiresAt, JSON.stringify(record));
      }
      for (const [tokenHash, record] of state.sessions) {
        insertSession.run(tokenHash, record.email, record.expiresAt, JSON.stringify(record));
      }
      for (const { id } of db.prepare('SELECT id FROM sites').all()) {
        if (!state.sites.has(id)) db.prepare('DELETE FROM sites WHERE id = ?').run(id);
      }
      for (const { account_email: email } of db.prepare('SELECT account_email FROM credits').all()) {
        if (!state.credits.has(email) || state.credits.get(email) <= 0) db.prepare('DELETE FROM credits WHERE account_email = ?').run(email);
      }
      for (const { token_hash: tokenHash } of db.prepare('SELECT token_hash FROM magic_links').all()) {
        if (!state.magicLinks.has(tokenHash)) db.prepare('DELETE FROM magic_links WHERE token_hash = ?').run(tokenHash);
      }
      for (const { token_hash: tokenHash } of db.prepare('SELECT token_hash FROM sessions').all()) {
        if (!state.sessions.has(tokenHash)) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function insertJob(entry) {
    db.prepare('INSERT INTO jobs (at, site_id, kind, status, data) VALUES (?, ?, ?, ?, ?)')
      .run(entry.at ?? new Date().toISOString(), entry.siteId ?? null, entry.kind ?? 'unknown', entry.status ?? null, JSON.stringify(entry));
  }

  return { db, loadState, saveState, insertJob };
}

function migrateJsonPilotState(db, dataDir, getMetadata, setMetadata) {
  if (getMetadata.get('json_pilot_migrated')) return;
  const statePath = path.join(dataDir, 'state.json');
  const jobsPath = path.join(dataDir, 'jobs.jsonl');
  const state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8'))
    : {};
  const sites = new Map(state.sites ?? []);
  const users = new Map(state.users ?? []);
  const oldJobs = [];
  if (existsSync(jobsPath)) {
    for (const line of readFileSync(jobsPath, 'utf8').split('\n').filter(Boolean)) {
      oldJobs.push(JSON.parse(line));
    }
  }
  const firstGenerationOwners = new Set();
  const activeSiteOwners = new Set();
  for (const site of sites.values()) {
    if (!site.ownerEmail || site.legacy === true) continue;
    if (activeSiteOwners.has(site.ownerEmail)) {
      // Keep historical pilot builds public and recoverable, but exclude them from the account's one active Studio slot.
      site.legacy = true;
    } else {
      activeSiteOwners.add(site.ownerEmail);
    }
  }
  for (const job of oldJobs) {
    const site = sites.get(job.siteId);
    if (job.kind === 'v1-request' && job.status !== 'failed' && site?.ownerEmail) {
      firstGenerationOwners.add(site.ownerEmail);
    }
  }
  for (const site of sites.values()) {
    if (site.ownerEmail && site.status === 'live') firstGenerationOwners.add(site.ownerEmail);
    if (site.ownerEmail && !users.has(site.ownerEmail)) {
      users.set(site.ownerEmail, { email: site.ownerEmail, createdAt: new Date().toISOString() });
    }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const insertUser = db.prepare('INSERT OR IGNORE INTO users (email, created_at, first_generation_used, brief_budget_used_eur, brief_turns_used) VALUES (?, ?, ?, ?, ?)');
    for (const [email, user] of users) {
      insertUser.run(email, user.createdAt ?? new Date().toISOString(), Number(Boolean(user.firstGenerationUsed || firstGenerationOwners.has(email))), Number(user.briefBudgetUsedEur ?? 0), Number(user.briefTurnsUsed ?? 0));
    }
    const insertSite = db.prepare('INSERT OR IGNORE INTO sites (id, owner_email, slug, legacy, data) VALUES (?, ?, ?, ?, ?)');
    for (const site of sites.values()) {
      insertSite.run(site.id, site.ownerEmail || null, site.slug || site.id, Number(Boolean(site.legacy)), JSON.stringify(site));
    }
    const insertMagicLink = db.prepare('INSERT OR IGNORE INTO magic_links (token_hash, email, expires_at, data) VALUES (?, ?, ?, ?)');
    for (const [tokenHash, record] of state.magicLinks ?? []) {
      insertMagicLink.run(tokenHash, record.email, record.expiresAt, JSON.stringify(record));
    }
    const insertSession = db.prepare('INSERT OR IGNORE INTO sessions (token_hash, email, expires_at, data) VALUES (?, ?, ?, ?)');
    for (const [tokenHash, record] of state.sessions ?? []) {
      insertSession.run(tokenHash, record.email, record.expiresAt, JSON.stringify(record));
    }
    const insertJob = db.prepare('INSERT INTO jobs (at, site_id, kind, status, data) VALUES (?, ?, ?, ?, ?)');
    for (const job of oldJobs) {
      insertJob.run(job.at ?? new Date().toISOString(), job.siteId ?? null, job.kind ?? 'unknown', job.status ?? null, JSON.stringify(job));
    }
    // The old balance map contained only disposable local test credits; no real purchases exist yet.
    setMetadata.run('json_pilot_migrated', new Date().toISOString());
    setMetadata.run('legacy_test_credits_discarded', 'true');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
