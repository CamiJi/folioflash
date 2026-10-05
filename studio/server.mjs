/**
 * Folioflash Studio — M1 (zero dependencies, Node 22+).
 *
 * Pipeline: POST /api/sites → POST /api/sites/:id/v1 (build, free) →
 * POST /api/sites/:id/edit {prompt} (rebuild, 1 credit).
 * Voice input is client-side (Web Speech API, free); server transcription (Whisper) in M2.
 * Real AI when LLM_PROVIDER + LLM_API_KEY are set (see lib/generate.mjs), else local fallback.
 * TODO(M1): magic-link auth, Stripe webhooks, push to per-client GitHub repo + Pages.
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { runJob } from './lib/pipeline.mjs';

const PORT = Number(process.env.PORT ?? 4322);
const STUDIO_USER = process.env.STUDIO_USER ?? '';
const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD ?? '';
const dataDir = new URL('./data/', import.meta.url);
const stateFile = new URL('./data/state.json', import.meta.url);
mkdirSync(dataDir, { recursive: true });
let savedState = { sites: [], credits: [] };
try {
  if (existsSync(stateFile)) savedState = JSON.parse(readFileSync(stateFile, 'utf8'));
} catch {
  console.error('[state] unable to parse state.json; starting with empty state');
}
const sites = new Map(savedState.sites ?? []);
const credits = new Map(savedState.credits ?? []); // test: 3 free edits per site owner
let lastLiveDir = null; // abs path of the most recent live dist/ — served on /demo
let seq = Math.max(0, ...[...sites.keys()].map((id) => Number(id.replace('site_', '')) || 0));
for (const site of [...sites.values()].reverse()) {
  if (site.status === 'live' && site.distDir) {
    const candidate = path.resolve(new URL('./', import.meta.url).pathname, site.distDir);
    if (existsSync(candidate)) {
      lastLiveDir = candidate;
      break;
    }
  }
}

function saveState() {
  writeFileSync(stateFile, `${JSON.stringify({ sites: [...sites], credits: [...credits] }, null, 2)}\n`, { mode: 0o600 });
}

function logJob(entry) {
  mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
  appendFileSync(
    new URL('./data/jobs.jsonl', import.meta.url),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
  );
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 200_000) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
  });
}

const send = (res, code, obj) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
};

const FORM = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Folioflash Studio (M1)</title></head><body style="font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">
<h1>⚡ Folioflash Studio <small>(M1)</small></h1>
<h2>1. New free V1</h2>
<form id="f">
<input name="name" placeholder="Your name" required style="display:block;width:100%;margin:.5rem 0;padding:.5rem">
<input name="craft" placeholder="Your craft (e.g. sound designer)" required style="display:block;width:100%;margin:.5rem 0;padding:.5rem">
<textarea id="prompt" name="prompt" placeholder="Describe your portfolio… or dictate it 🎤" required rows="5" style="display:block;width:100%;margin:.5rem 0;padding:.5rem"></textarea>
<div><button type="button" id="mic">🎤 dictate</button>
<select id="vl"><option value="en-US">EN</option><option value="fr-FR">FR</option></select>
<select name="palette" style="margin:.5rem 0;padding:.5rem">
<option value="paper">Paper</option><option value="iris">Iris (dark)</option><option value="forest">Forest</option>
</select></div>
<button>Generate my free V1</button>
</form>
<h2>2. Regenerate (1 credit)</h2>
<form id="e">
<input name="id" placeholder="site id (e.g. site_1)" required style="display:block;width:100%;margin:.5rem 0;padding:.5rem">
<textarea name="prompt" placeholder="Change… (e.g. darker theme, add a contact section)" required rows="3" style="display:block;width:100%;margin:.5rem 0;padding:.5rem"></textarea>
<button>Regenerate + redeploy</button>
</form>
<pre id="out"></pre>
<script>
const out = document.getElementById('out');
mic.onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { out.textContent = 'Voice input not supported in this browser — type your prompt.'; return; }
  const r = new SR(); r.lang = vl.value; r.interimResults = false;
  r.onresult = (e) => { prompt.value += (prompt.value ? ' ' : '') + e.results[0][0].transcript; };
  r.onerror = (e) => { out.textContent = 'Mic error: ' + e.error; };
  r.start(); mic.textContent = '🎤 listening…'; r.onend = () => mic.textContent = '🎤 dictate';
};
f.onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(f));
  let r = await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const site = await r.json(); out.textContent = JSON.stringify(site, null, 2);
  if (!site.id) return;
  out.textContent += '\\nbuilding V1…';
  r = await fetch('/api/sites/' + site.id + '/v1', { method: 'POST' });
  out.textContent = JSON.stringify(await r.json(), null, 2);
};
e.onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  const r = await fetch('/api/sites/' + body.id + '/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: body.prompt }) });
  out.textContent = JSON.stringify(await r.json(), null, 2);
};
</script></body></html>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/** Serve the most recent live site on /demo (M1 preview — Pages per-client in M1-next). */
function serveDemo(req, res, pathname) {
  if (!lastLiveDir) {
    send(res, 404, { error: 'no live demo yet — generate a V1 first' });
    return;
  }
  let rel = pathname === '/demo' || pathname === '/demo/' ? 'index.html' : pathname.slice('/demo/'.length);
  const file = path.normalize(path.join(lastLiveDir, rel));
  if (!file.startsWith(lastLiveDir) || !existsSync(file) || statSync(file).isDirectory()) {
    // Fallback to extensionless-route convention: <rel>/index.html
    const nested = path.join(lastLiveDir, rel, 'index.html');
    if (nested.startsWith(lastLiveDir) && existsSync(nested)) {
      res.setHeader('Content-Type', MIME['.html']);
      res.end(readFileSync(nested));
      return;
    }
    send(res, 404, { error: 'not found' });
    return;
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const m = url.pathname.match(/^\/api\/sites\/([^/]+)(\/(v1|edit))?$/);

  // The portfolio demo stays public. The prompt UI and write APIs are protected
  // before any paid LLM key is enabled; HTTP Basic Auth is handled by browsers.
  if ((url.pathname === '/' || url.pathname.startsWith('/api/')) && STUDIO_USER && STUDIO_PASSWORD) {
    const auth = req.headers.authorization ?? '';
    const encoded = auth.startsWith('Basic ') ? auth.slice(6) : '';
    let supplied = '';
    try {
      supplied = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      supplied = '';
    }
    const expected = `${STUDIO_USER}:${STUDIO_PASSWORD}`;
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm="Folioflash Studio", charset="UTF-8"');
      res.end('Authentication required');
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(FORM);
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/demo' || url.pathname.startsWith('/demo/'))) {
    serveDemo(req, res, url.pathname);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    send(res, 200, { ok: true, sites: sites.size });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/sites') {
    send(res, 200, [...sites.values()]);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sites') {
    try {
      const body = await readJson(req);
      const name = String(body.name ?? '').trim();
      const craft = String(body.craft ?? '').trim();
      const prompt = String(body.prompt ?? '').trim();
      if (!name || !craft || !prompt) {
        send(res, 400, { error: 'name, craft and prompt are required' });
        return;
      }
      const id = `site_${++seq}`;
      const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const site = {
        id, slug, name, craft, prompt: prompt.slice(0, 500),
        palette: ['paper', 'iris', 'forest'].includes(body.palette) ? body.palette : 'paper',
        status: 'draft',
      };
      sites.set(id, site);
      credits.set(id, 3); // test: 3 free edits, V1 build itself is free
      saveState();
      send(res, 201, { ...site, credits: 3 });
    } catch (err) {
      send(res, 400, { error: err.message });
    }
    return;
  }
  if (m && req.method === 'GET' && !m[3]) {
    const site = sites.get(m[1]);
    if (!site) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    send(res, 200, { ...site, credits: credits.get(m[1]) ?? 0 });
    return;
  }
  if (m && req.method === 'POST' && (m[3] === 'v1' || m[3] === 'edit')) {
    const site = sites.get(m[1]);
    if (!site) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    const kind = m[3];
    try {
      const body = kind === 'edit' ? await readJson(req) : {};
      const prompt = kind === 'edit' ? String(body.prompt ?? '').trim() : site.prompt;
      if (!prompt) {
        send(res, 400, { error: 'prompt is required' });
        return;
      }
      if (kind === 'edit') {
        const balance = credits.get(m[1]) ?? 0;
        if (balance < 1) {
          send(res, 402, { error: 'no credits left — buy more (Stripe in M1-next)' });
          return;
        }
        credits.set(m[1], balance - 1);
      }
      site.status = 'building';
      saveState();
      const result = await runJob({
        slug: site.slug,
        kind,
        profile: site,
        prompt: kind === 'edit'
          ? `${site.prompt}\n\nRequested update: ${prompt}`
          : prompt,
      });
      site.status = result.status;
      site.distDir = result.distDir;
      if (result.absDistDir) lastLiveDir = result.absDistDir;
      saveState();
      logJob({ kind: `${kind}-request`, siteId: m[1], slug: site.slug, ...result.usage });
      send(res, 200, { ...site, credits: credits.get(m[1]) ?? 0, usage: result.usage });
    } catch (err) {
      site.status = 'failed';
      if (kind === 'edit') credits.set(m[1], (credits.get(m[1]) ?? 0) + 1);
      saveState();
      logJob({ kind: `${kind}-request`, siteId: m[1], status: 'failed', error: err.message });
      send(res, 500, { error: err.message, credits: credits.get(m[1]) ?? 0 });
    }
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`folioflash-studio listening on :${PORT}`));
