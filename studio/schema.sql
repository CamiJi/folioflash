-- Folioflash Studio — SQLite schema (M1 next: wired via better-sqlite3 or node:sqlite).
-- M1 skeleton logs to data/jobs.jsonl; this schema is the target when auth lands.

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  credits INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  craft TEXT NOT NULL,
  palette TEXT NOT NULL DEFAULT 'paper',
  status TEXT NOT NULL DEFAULT 'queued', -- queued|building|live|failed
  repo TEXT,                              -- e.g. Folioflash-xyz/slug
  hostname TEXT,                          -- you.folioflash.site or custom domain
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id),
  kind TEXT NOT NULL,                     -- v1|edit
  prompt TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_est_eur REAL,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued|done|failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS domains (
  site_id TEXT PRIMARY KEY REFERENCES sites(id),
  hostname TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|verified|failed
  checked_at TEXT
);
