import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  const link = (message.text ?? message.textContent).match(/https:\/\/\S+/)?.[0];
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

function tinyWebpDataUrl() {
  const image = Buffer.alloc(30);
  image.write('RIFF', 0, 'ascii');
  image.writeUInt32LE(22, 4);
  image.write('WEBP', 8, 'ascii');
  image.write('VP8X', 12, 'ascii');
  image.writeUInt32LE(10, 16);
  image.writeUIntLE(0, 24, 3);
  image.writeUIntLE(0, 27, 3);
  return `data:image/webp;base64,${image.toString('base64')}`;
}

test('magic links create isolated accounts, one-time sessions and logout', async (t) => {
  const testDir = mkdtempSync(path.join(TMP_ROOT, 'folioflash-auth-'));
  const captureFile = path.join(testDir, 'email.json');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--experimental-sqlite', '--import', './test-support/mock-nodemailer.mjs', 'server.mjs'], {
    cwd: STUDIO_DIR,
    env: {
      ...process.env,
      AUTH_MODE: 'magic',
      PORT: String(port),
      PUBLIC_BASE_URL: 'https://folioflash.example.test',
      RESEND_API_KEY: 'test-resend-key-not-real',
      MAIL_FROM: 'studio@example.test',
      SESSION_SECRET: 'test-secret-at-least-thirty-two-characters-long',
      MAGIC_ALLOWED_EMAILS: 'one@example.test,two@example.test',
      BRIEF_TEST_FREE_EMAILS: 'one@example.test',
      EMAIL_PROVIDER: 'brevo-smtp',
      SMTP_HOST: 'smtp-relay.brevo.test',
      SMTP_PORT: '587',
      SMTP_SECURITY: 'starttls',
      SMTP_LOGIN: 'brevo-test-login',
      SMTP_PASS: 'brevo-test-password-not-real',
      RESEND_API_KEY: '',
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
  const loginHtml = await loginPage.text();
  assert.match(loginHtml, /Ton espace créatif/);
  assert.match(loginHtml, /class="brand" href="\/"/);
  assert.match(loginHtml, /Retour à Folioflash/);
  const interFont = await fetch(`${baseUrl}/brand-fonts/inter.woff2`);
  assert.equal(interFont.status, 200);
  assert.match(interFont.headers.get('content-type'), /font\/woff2/);
  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/studio`, { redirect: 'manual' })).status, 303);
  assert.equal((await fetch(`${baseUrl}/api/sites`)).status, 401);
  const uninvited = await fetch(`${baseUrl}/api/auth/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'outside@example.test' }),
  });
  assert.equal(uninvited.status, 202);
  assert.equal(existsSync(captureFile), false, 'non-allowlisted addresses receive no email');

  const disposable = await fetch(`${baseUrl}/api/auth/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'junk@mailinator.com' }),
  });
  assert.equal(disposable.status, 202);
  assert.equal(existsSync(captureFile), false, 'throwaway addresses receive no email');

  const firstToken = await requestLoginLink(baseUrl, 'one@example.test', captureFile);
  const firstCookie = await confirmLink(baseUrl, firstToken);
  const studioPage = await fetch(`${baseUrl}/studio`, { headers: { cookie: firstCookie } });
  assert.equal(studioPage.status, 200);
  const studioHtml = await studioPage.text();
  assert.match(studioHtml, /one@example.test/);
  assert.doesNotMatch(studioHtml, /Mes sites/);
  assert.match(studioHtml, /id="brief-input"/);
  assert.match(studioHtml, /id="image-input"/);
  assert.match(studioHtml, /id="brief-mic"/);
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
  assert.equal(site.credits, 0);
  assert.equal(site.firstGenerationFree, true);

  const listed = await (await fetch(`${baseUrl}/api/sites`, { headers: { cookie: firstCookie } })).json();
  assert.equal(listed[0].slug, 'first-portfolio');
  assert.equal((await fetch(`${baseUrl}/s/first-portfolio`)).status, 404, 'draft sites have no public page');
  assert.equal((await fetch(`${baseUrl}/s/no-such-site`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/s/../server.mjs`)).status, 404, 'no path traversal');

  const secondToken = await requestLoginLink(baseUrl, 'two@example.test', captureFile);
  const secondCookie = await confirmLink(baseUrl, secondToken);
  const isolatedSites = await fetch(`${baseUrl}/api/sites`, { headers: { cookie: secondCookie } });
  assert.deepEqual(await isolatedSites.json(), []);
  const privateSite = await fetch(`${baseUrl}/api/sites/${site.id}`, { headers: { cookie: secondCookie } });
  assert.equal(privateSite.status, 404);

  const draftResponse = await fetch(`${baseUrl}/api/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({}),
  });
  assert.equal(draftResponse.status, 201);
  const draft = await draftResponse.json();
  assert.equal(draft.status, 'draft');
  const duplicateDraft = await fetch(`${baseUrl}/api/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({}),
  });
  assert.equal(duplicateDraft.status, 409, 'the conversation draft reserves the account portfolio slot');
  const initialBrief = await (await fetch(`${baseUrl}/api/sites/${draft.id}/brief`, { headers: { cookie: secondCookie } })).json();
  assert.equal(initialBrief.messages.length, 1);
  assert.equal(initialBrief.limits.maxTurns, 6);

  const uploaded = await fetch(`${baseUrl}/api/sites/${draft.id}/assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ name: 'mon-travail.png', dataUrl: tinyWebpDataUrl(), width: 1, height: 1 }),
  });
  assert.equal(uploaded.status, 201);
  const asset = await uploaded.json();
  assert.match(asset.id, /^[a-f0-9-]{36}$/i);
  assert.equal((await fetch(`${baseUrl}/api/sites/${draft.id}/assets/${asset.id}`, { headers: { cookie: secondCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/sites/${draft.id}/assets/${asset.id}`, { headers: { cookie: firstCookie } })).status, 404);
  const briefing = await fetch(`${baseUrl}/api/sites/${draft.id}/brief`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ message: 'Je m’appelle Zoé et je suis photographe.', assetIds: [asset.id] }),
  });
  assert.equal(briefing.status, 200);
  const briefState = await briefing.json();
  assert.equal(briefState.turn, 1);
  assert.equal(briefState.ready, false, 'the evaluator does not infer missing facts from the uploaded image');
  assert.ok(briefState.missing.includes('images'), 'publication consent is required for uploaded images');
  assert.equal((await fetch(`${baseUrl}/api/sites/${draft.id}`, { headers: { cookie: firstCookie } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/sites/${draft.id}`, { headers: { cookie: secondCookie } })).status, 200);
  await fetch(`${baseUrl}/api/sites/${draft.id}`, { method: 'DELETE', headers: { cookie: secondCookie } });
  const replacementDraft = await fetch(`${baseUrl}/api/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({}),
  });
  const replacement = await replacementDraft.json();
  const resumedBrief = await (await fetch(`${baseUrl}/api/sites/${replacement.id}/brief`, { headers: { cookie: secondCookie } })).json();
  assert.equal(resumedBrief.turn, 1, 'deleting a draft does not reset the account-wide conversation limit');

  const ownSites = await fetch(`${baseUrl}/api/sites`, { headers: { cookie: firstCookie } });
  assert.equal((await ownSites.json()).length, 1);

  const duplicate = await fetch(`${baseUrl}/api/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: firstCookie },
    body: JSON.stringify({ name: 'Second Portfolio', craft: 'Baker', prompt: 'Bread.' }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).siteId, site.id);

  const freeGeneration = await fetch(`${baseUrl}/api/sites/${site.id}/v1`, {
    method: 'POST',
    headers: { cookie: firstCookie },
  });
  assert.equal(freeGeneration.status, 200, 'the first V1 is free');
  const afterFreeGeneration = await (await fetch(`${baseUrl}/api/sites`, { headers: { cookie: firstCookie } })).json();
  assert.equal(afterFreeGeneration[0].firstGenerationFree, false, 'the free-generation flag is account-scoped and persisted');
  assert.equal(afterFreeGeneration[0].canRebrief, true, 'an explicitly test-allowlisted operator gets one internal rebrief allowance');
  const rebrief = await fetch(`${baseUrl}/api/sites/${site.id}/brief/start`, { method: 'POST', headers: { cookie: firstCookie } });
  assert.equal(rebrief.status, 200);
  assert.equal((await rebrief.json()).site.rebriefing, true);
  const canceledRebrief = await fetch(`${baseUrl}/api/sites/${site.id}/brief/cancel`, { method: 'POST', headers: { cookie: firstCookie } });
  assert.equal(canceledRebrief.status, 200);
  assert.equal((await canceledRebrief.json()).status, 'live', 'cancel keeps the existing live site untouched');
  const secondGeneration = await fetch(`${baseUrl}/api/sites/${site.id}/v1`, {
    method: 'POST',
    headers: { cookie: firstCookie },
  });
  assert.equal(secondGeneration.status, 402, 'later generations require credits');
  const editWithoutCredits = await fetch(`${baseUrl}/api/sites/${site.id}/edit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: firstCookie },
    body: JSON.stringify({ prompt: 'Change the colors.' }),
  });
  assert.equal(editWithoutCredits.status, 402);

  const removal = await fetch(`${baseUrl}/api/sites/${site.id}`, { method: 'DELETE', headers: { cookie: firstCookie } });
  assert.equal(removal.status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/sites`, { headers: { cookie: firstCookie } })).json(), []);
  const recreated = await fetch(`${baseUrl}/api/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: firstCookie },
    body: JSON.stringify({ name: 'Second Portfolio', craft: 'Baker', prompt: 'Bread.' }),
  });
  assert.equal(recreated.status, 201);
  const recreatedSite = await recreated.json();
  assert.equal(recreatedSite.credits, 0);
  assert.equal(recreatedSite.firstGenerationFree, false, 'deleting a site does not reset the account free-generation entitlement');
  const repeatedFreeGeneration = await fetch(`${baseUrl}/api/sites/${recreatedSite.id}/v1`, {
    method: 'POST',
    headers: { cookie: firstCookie },
  });
  assert.equal(repeatedFreeGeneration.status, 402);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: firstCookie } });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(`${baseUrl}/api/sites`, { headers: { cookie: firstCookie } })).status, 401);

  const state = readFileSync(path.join(testDir, 'folioflash.sqlite'));
  assert.equal(state.includes(Buffer.from(firstCookie.split('=')[1])), false, 'session secrets are not persisted in raw form');
});

test('public landing is bilingual while the operator Studio keeps its temporary Basic gate', async (t) => {
  const testDir = mkdtempSync(path.join(TMP_ROOT, 'folioflash-basic-'));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--experimental-sqlite', 'server.mjs'], {
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
  const studioHtml = await studio.text();
  assert.match(studioHtml, /On commence par parler de ton travail/);
  assert.match(studioHtml, /id="brief-input"/);
  assert.doesNotMatch(studioHtml, /Créer un portfolio/);
});
