import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openStore } from '../lib/database.mjs';

test('SQLite imports the JSON pilot state once and preserves the one-free-generation rule', () => {
  const dataDir = mkdtempSync('/var/www/html/www/storage/tmp/opencode/folioflash-db-');
  let storeOpen = true;
  const statePath = path.join(dataDir, 'state.json');
  const jobsPath = path.join(dataDir, 'jobs.jsonl');
  writeFileSync(statePath, JSON.stringify({
    users: [['maker@example.test', { email: 'maker@example.test', createdAt: '2026-10-01T00:00:00.000Z' }]],
    sites: [
      ['site_1', { id: 'site_1', slug: 'maker', ownerEmail: 'maker@example.test', legacy: false, status: 'live' }],
      ['site_2', { id: 'site_2', slug: 'old-pilot', ownerEmail: 'maker@example.test', legacy: false, status: 'live' }],
    ],
    credits: [['site_1', 3]],
    magicLinks: [['link-digest', { email: 'maker@example.test', expiresAt: 1_800_000_000_000 }]],
    sessions: [['session-digest', { email: 'maker@example.test', expiresAt: 1_900_000_000_000 }]],
  }));
  writeFileSync(jobsPath, `${JSON.stringify({ at: '2026-10-01T00:00:00.000Z', kind: 'v1-request', siteId: 'site_1', status: 'live' })}\n`);

  const store = openStore(dataDir);
  try {
    const state = store.loadState();
    assert.equal(state.sites.get('site_1').ownerEmail, 'maker@example.test');
    assert.equal(state.sites.get('site_1').legacy, false, 'the first active site keeps the account slot');
    assert.equal(state.sites.get('site_2').legacy, true, 'extra historical pilots stay public but leave the Studio account slot');
    assert.equal(state.users.get('maker@example.test').firstGenerationUsed, true);
    assert.equal(state.credits.has('maker@example.test'), false, 'legacy local test credits are not real purchased credits');
    assert.equal(state.magicLinks.has('link-digest'), true);
    assert.equal(state.sessions.has('session-digest'), true);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 1);
    assert.ok(existsSync(statePath), 'the original JSON state remains as a recovery copy');
    assert.ok(store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payments'").get());
    assert.ok(store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ledger_entries'").get());

    const duplicateSite = { id: 'site_3', slug: 'second', ownerEmail: 'maker@example.test', legacy: false, status: 'draft' };
    state.sites.set(duplicateSite.id, duplicateSite);
    assert.throws(() => store.saveState(state), /UNIQUE constraint failed/);
    state.sites.delete(duplicateSite.id);
    store.db.close();
    storeOpen = false;

    const reopened = openStore(dataDir);
    try {
      assert.equal(reopened.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 1, 'legacy jobs are not imported twice');
      assert.equal(reopened.loadState().users.get('maker@example.test').firstGenerationUsed, true);
    } finally {
      reopened.db.close();
    }
  } finally {
    if (storeOpen) store.db.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
