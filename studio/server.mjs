/**
 * Folioflash Studio — M1 skeleton (zero dependencies, Node 22+).
 *
 * What it does TODAY: intake form (prompt + profile fields), in-memory site
 * records, append-only job log (data/jobs.jsonl), cost estimate per request.
 * What's STUBBED (M1 next): magic-link auth, real AI generation, repo creation,
 * Stripe webhooks, DNS checks. Each stub is marked TODO(M1).
 */
import { createServer } from 'node:http';
import { mkdirSync, appendFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 4322);
const sites = new Map();
let seq = 0;

const COST_PER_JOB_EST = 0.8; // € — placeholder, replaced by measured tokens (see docs/couts.md §5)

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

const FORM = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Folioflash Studio (M1)</title></head><body style="font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">
<h1>⚡ Folioflash Studio <small>(M1 skeleton)</small></h1>
<form id="f">
<input name="name" placeholder="Your name" required style="display:block;width:100%;margin:.5rem 0;padding:.5rem">
<input name="craft" placeholder="Your craft (e.g. sound designer)" required style="display:block;width:100%;margin:.5rem 0;padding:.5rem">
<textarea name="prompt" placeholder="Describe your portfolio…" required rows="5" style="display:block;width:100%;margin:.5rem 0;padding:.5rem"></textarea>
<select name="palette" style="margin:.5rem 0;padding:.5rem">
<option value="paper">Paper</option><option value="iris">Iris (dark)</option><option value="forest">Forest</option>
</select>
<button>Generate my free V1</button>
</form><pre id="out"></pre>
<script>
f.onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(f));
  const r = await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  out.textContent = JSON.stringify(await r.json(), null, 2);
};
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET' && url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(FORM);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.end(JSON.stringify({ ok: true, sites: sites.size }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/sites') {
    res.end(JSON.stringify([...sites.values()]));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sites') {
    try {
      const body = await readJson(req);
      const name = String(body.name ?? '').trim();
      const craft = String(body.craft ?? '').trim();
      const prompt = String(body.prompt ?? '').trim();
      if (!name || !craft || !prompt) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'name, craft and prompt are required' }));
        return;
      }
      const id = `site_${++seq}`;
      const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      // TODO(M1): magic-link auth — attach req user instead of trusting the name field
      // TODO(M1): run the real AI job (site.json + project .md + images) then push to client repo
      const site = {
        id, slug, name, craft, prompt: prompt.slice(0, 500),
        palette: ['paper', 'iris', 'forest'].includes(body.palette) ? body.palette : 'paper',
        status: 'queued', costEstEur: COST_PER_JOB_EST,
      };
      sites.set(id, site);
      logJob({ kind: 'v1-request', siteId: id, slug, costEstEur: COST_PER_JOB_EST });
      res.statusCode = 201;
      res.end(JSON.stringify(site));
    } catch (err) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log(`folioflash-studio listening on :${PORT}`));
