import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP_ROOT = '/var/www/html/www/storage/tmp/opencode';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  return port;
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Studio exited early (${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Studio did not start in time');
}

async function requestLoginLink(baseUrl, email, captureFile) {
  const response = await fetch(`${baseUrl}/api/auth/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.match(body.message, /Si cette adresse/);
  const message = JSON.parse(readFileSync(captureFile, 'utf8'));
  const link = message.text.match(/https:\/\/\S+/)?.[0];
  assert.ok(link, 'mock email should contain a magic link');
  return new URL(link).searchParams.get('token');
}

async function confirmLink(baseUrl, token) {
  const preview = await fetch(`${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`);
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /Confirmer la connexion/);
  assert.match(previewHtml, /[a-z]•••@example\.test/);
  const response = await fetch(`${baseUrl}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/studio');
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  return cookie.split(';')[0];
}

test('magic links create isolated accounts, one-time sessions and logout', async (t) => {
  const testDir = mkdtempSync(path.join(TMP_ROOT, 'folioflash-auth-'));
  const captureFile = path.join(testDir, 'email.json');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', './test-support/mock-resend.mjs', 'server.mjs'], {
    cwd: STUDIO_DIR,
    env: {
      ...process.env,
      AUTH_MODE: 'magic',
      PORT: String(port),
      PUBLIC_BASE_URL: 'https://folioflash.example.test',
      RESEND_API_KEY: 'test-resend-key-not-real',
      MAIL_FROM: 'studio@example.test',
      SESSION_SECRET: 'test-secret-at-least-thirty-two-characters-long',
      STUDIO_DATA_DIR: testDir,
      TEST_EMAIL_CAPTURE_FILE: captureFile,
      LLM_PROVIDER: '',
      LLM_API_KEY: '',
    },
    stdio: 'ignore',
  });
  t.after(() => {
    child.kill('SIGTERM');
    rmSync(testDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child);

  const loginPage = await fetch(`${baseUrl}/login`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /Ton espace créatif/);
  const interFont = await fetch(`${baseUrl}/brand-fonts/inter.woff2`);
  assert.equal(interFont.status, 200);
  assert.match(interFont.headers.get('content-type'), /font\/woff2/);
  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/studio`, { redirect: 'manual' })).status, 303);
  assert.equal((await fetch(`${baseUrl}/api/sites`)).status, 401);

  const firstToken = await requestLoginLink(baseUrl, 'one@example.test', captureFile);
  const firstCookie = await confirmLink(baseUrl, firstToken);
  const studioPage = await fetch(`${baseUrl}/studio`, { headers: { cookie: firstCookie } });
  assert.equal(studioPage.status, 200);
  assert.match(await studioPage.text(), /one@example.test/);
  assert.equal((await fetch(`${baseUrl}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: firstToken }),
    redirect: 'manual',
  })).status, 303);

  const created = await fetch(`${baseUrl}/api/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: firstCookie },
    body: JSON.stringify({
      name: 'First Portfolio',
      craft: 'Illustrator',
      prompt: 'Three illustration projects.',
      stylePreference: 'Quiet and playful',
    }),
  });
  assert.equal(created.status, 201);
  const site = await created.json();

  const secondToken = await requestLoginLink(baseUrl, 'two@example.test', captureFile);
  const secondCookie = await confirmLink(baseUrl, secondToken);
  const isolatedSites = await fetch(`${baseUrl}/api/sites`, { headers: { cookie: secondCookie } });
  assert.deepEqual(await isolatedSites.json(), []);
  const privateSite = await fetch(`${baseUrl}/api/sites/${site.id}`, { headers: { cookie: secondCookie } });
  assert.equal(privateSite.status, 404);

  const ownSites = await fetch(`${baseUrl}/api/sites`, { headers: { cookie: firstCookie } });
  assert.equal((await ownSites.json()).length, 1);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: firstCookie } });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(`${baseUrl}/api/sites`, { headers: { cookie: firstCookie } })).status, 401);

  const state = readFileSync(path.join(testDir, 'state.json'), 'utf8');
  assert.equal(state.includes(firstCookie.split('=')[1]), false, 'session secrets are not persisted in raw form');
});

test('public landing is bilingual while the operator Studio keeps its temporary Basic gate', async (t) => {
  const testDir = mkdtempSync(path.join(TMP_ROOT, 'folioflash-basic-'));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: STUDIO_DIR,
    env: {
      ...process.env,
      AUTH_MODE: 'basic',
      STUDIO_USER: 'operator-test',
      STUDIO_PASSWORD: 'local-test-password',
      PORT: String(port),
      STUDIO_DATA_DIR: testDir,
      LLM_PROVIDER: '',
      LLM_API_KEY: '',
    },
    stdio: 'ignore',
  });
  t.after(() => {
    child.kill('SIGTERM');
    rmSync(testDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child);
  const frenchLanding = await fetch(baseUrl);
  assert.equal(frenchLanding.status, 200);
  assert.match(await frenchLanding.text(), /Ton portfolio/);
  const englishLanding = await fetch(`${baseUrl}/?lang=en`);
  assert.match(await englishLanding.text(), /Your portfolio/);
  assert.equal((await fetch(`${baseUrl}/studio`, { redirect: 'manual' })).status, 401);
  const studio = await fetch(`${baseUrl}/studio`, {
    headers: { authorization: `Basic ${Buffer.from('operator-test:local-test-password').toString('base64')}` },
  });
  assert.equal(studio.status, 200);
  assert.match(await studio.text(), /Créer un portfolio/);
});
