import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FALLBACK_THEMES } from '../lib/generate.mjs';

const STUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP_ROOT = '/var/www/html/www/storage/tmp/opencode';

async function freePort() {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Studio exited early (${child.exitCode})`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {
      // wait for server boot
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Studio did not start');
}

test('an internal operator can rebrief a live site without taking the current version offline', async (t) => {
  const dataDir = mkdtempSync(path.join(TMP_ROOT, 'folioflash-rebrief-'));
  const port = await freePort();
  const llmPort = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const oldSlug = `old-portfolio-${port}`;
  const newName = `Nouveau portfolio ${port}`;
  const newSlug = `nouveau-portfolio-${port}`;
  const calls = [];
  const llmServer = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    calls.push(payload.messages[0].content);
    const system = payload.messages[0].content;
    let body;
    if (system.includes('You generate portfolio content as STRICT JSON')) {
      body = {
        tagline: 'Photographer of live music.',
        bio: 'A short confirmed artist profile.',
        theme: FALLBACK_THEMES.paper,
        art: { one: '#ddddee', two: '#ccbbaa', three: '#998877' },
        motif: 'cercles',
        designDirection: 'Quiet editorial presentation',
        projectPresentation: 'editorial',
        projects: [],
        fr: { tagline: 'Photographe de musique.', bio: 'Une présentation confirmée.' },
      };
    } else if (system.includes('évaluateur factuel')) {
      body = {
        profile: {
          displayName: newName,
          nameIsPseudonym: false,
          craft: 'Photographe de scène',
          audience: 'Salles de concert',
          goal: 'Présenter mon travail et recevoir des demandes',
          bio: 'Photographie de scène, sans expérience inventée.',
          experiences: [],
          projects: [],
          articles: [],
          articlesReviewed: true,
          noProjectsYet: true,
          visual: { preference: '', references: [], allowCreativeDirection: true },
          layout: { preference: 'Une page éditoriale simple', cardsJustified: false },
          contact: { email: '', website: 'https://zoe.example.test', linkedin: 'https://www.linkedin.com/in/zoe-test', cta: 'Réserver une séance' },
          imagesApproved: true,
        },
        missing: [],
        focus: '',
        ready: true,
        summary: 'Nouveau portfolio pour une photographe de scène. Pas de projets ni de publications à afficher pour le moment. Direction éditoriale libre.',
      };
    } else {
      body = { reply: 'Le brief est prêt.' };
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) } }],
      usage: { prompt_tokens: 200, completion_tokens: 300, cost: 0.00002 },
    }));
  });
  llmServer.listen(llmPort, '127.0.0.1');
  await once(llmServer, 'listening');

  const child = spawn(process.execPath, ['--experimental-sqlite', 'server.mjs'], {
    cwd: STUDIO_DIR,
    env: {
      ...process.env,
      AUTH_MODE: 'basic',
      STUDIO_USER: 'owner@example.test',
      STUDIO_PASSWORD: 'test-password',
      PORT: String(port),
      PUBLIC_BASE_URL: 'https://folioflash.example.test',
      STUDIO_DATA_DIR: dataDir,
      LLM_PROVIDER: 'openrouter',
      LLM_API_KEY: 'test-openrouter-key',
      LLM_MODEL: 'google/test-model',
      BRIEF_MODEL: 'google/test-model',
      BRIEF_TEST_FREE_EMAILS: 'owner@example.test',
      OPENROUTER_BASE_URL: `http://127.0.0.1:${llmPort}`,
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await new Promise((resolve) => llmServer.close(resolve));
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(path.join(STUDIO_DIR, 'data', 'builds', oldSlug), { recursive: true, force: true });
    rmSync(path.join(STUDIO_DIR, 'data', 'builds', newSlug), { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);
  const authorization = `Basic ${Buffer.from('owner@example.test:test-password').toString('base64')}`;
  const headers = { authorization, 'content-type': 'application/json' };

  const created = await fetch(`${baseUrl}/api/sites`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: `Old portfolio ${port}`, craft: 'Designer', prompt: 'An existing live portfolio.' }),
  });
  assert.equal(created.status, 201);
  const oldSite = await created.json();
  const firstBuild = await fetch(`${baseUrl}/api/sites/${oldSite.id}/v1`, { method: 'POST', headers: { authorization } });
  const firstBuildResult = await firstBuild.json();
  assert.equal(firstBuild.status, 200, JSON.stringify(firstBuildResult));
  assert.equal((await fetch(`${baseUrl}/s/${oldSlug}`)).status, 200);

  const start = await fetch(`${baseUrl}/api/sites/${oldSite.id}/brief/start`, { method: 'POST', headers: { authorization } });
  assert.equal(start.status, 200, 'the operator has one explicit internal rebrief allowance');
  assert.equal((await start.json()).site.rebriefing, true);
  assert.equal((await fetch(`${baseUrl}/s/${oldSlug}`)).status, 200, 'the public version stays live during the conversation');
  const canceled = await fetch(`${baseUrl}/api/sites/${oldSite.id}/brief/cancel`, { method: 'POST', headers: { authorization } });
  assert.equal(canceled.status, 200);
  assert.equal((await fetch(`${baseUrl}/s/${oldSlug}`)).status, 200, 'cancel keeps the old public build');
  const restart = await fetch(`${baseUrl}/api/sites/${oldSite.id}/brief/start`, { method: 'POST', headers: { authorization } });
  assert.equal(restart.status, 200);

  const turn = await fetch(`${baseUrl}/api/sites/${oldSite.id}/brief`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Confirme le brief complet.' }),
  });
  assert.equal(turn.status, 200);
  assert.equal((await turn.json()).ready, true);
  const rebriefed = await fetch(`${baseUrl}/api/sites/${oldSite.id}/v1`, { method: 'POST', headers: { authorization } });
  assert.equal(rebriefed.status, 200, 'the explicit internal QA allowance does not require Stripe or a credit');
  const newSite = await rebriefed.json();
  assert.equal(newSite.slug, newSlug);
  assert.equal((await fetch(`${baseUrl}/s/${newSlug}`)).status, 200);
  const robots = await (await fetch(`${baseUrl}/s/${newSlug}/robots.txt`)).text();
  assert.match(robots, new RegExp(`Sitemap: https://folioflash\\.example\\.test/s/${newSlug}/sitemap-index\\.xml`));
  const sitemapIndex = await (await fetch(`${baseUrl}/s/${newSlug}/sitemap-index.xml`)).text();
  assert.match(sitemapIndex, new RegExp(`https://folioflash\\.example\\.test/s/${newSlug}/sitemap-0\\.xml`));
  const sitemap = await (await fetch(`${baseUrl}/s/${newSlug}/sitemap-0.xml`)).text();
  assert.ok(sitemap.includes(`https://folioflash.example.test/s/${newSlug}/persona.json`));
  const persona = await (await fetch(`${baseUrl}/s/${newSlug}/persona.json`)).json();
  assert.equal(persona['@type'], 'Person');
  assert.equal(persona.name, newName);
  assert.ok(persona.sameAs.includes('https://www.linkedin.com/in/zoe-test'));
  assert.ok(persona.sameAs.includes('https://zoe.example.test/'));
  const html = await (await fetch(`${baseUrl}/s/${newSlug}/`)).text();
  assert.ok(html.includes(`rel="canonical" href="https://folioflash.example.test/s/${newSlug}/"`));
  assert.ok(html.includes('"@type":"ProfilePage"'));
  assert.equal((await fetch(`${baseUrl}/s/${oldSlug}`)).status, 404, 'the replaced site has one current public slug');
  assert.equal((await (await fetch(`${baseUrl}/api/sites`, { headers: { authorization } })).json())[0].canRebrief, false);
  assert.equal(calls.filter((system) => system.includes('évaluateur factuel')).length, 1);
  assert.equal(calls.filter((system) => system.includes('You generate portfolio content as STRICT JSON')).length, 2);
});
