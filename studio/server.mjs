/**
 * Folioflash Studio — M1 (zero dependencies, Node 22+).
 *
 * Pipeline: POST /api/sites → POST /api/sites/:id/v1 (build, free) →
 * POST /api/sites/:id/edit {prompt} (rebuild, 1 credit).
 * Voice input is client-side (Web Speech API, free); server transcription (Whisper) in M2.
 * Real AI when LLM_PROVIDER + LLM_API_KEY are set (see lib/generate.mjs), else local fallback.
 * Auth supports operator Basic mode and customer magic links (requires a verified email sender).
 * TODO(M1): Stripe webhooks, uploads/optimization, customer-domain multi-site routing.
 */
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, appendFileSync, readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { runJob } from './lib/pipeline.mjs';
import { createOpaqueToken, digestToken, isValidEmail, normalizeEmail, parseCookies } from './lib/auth.mjs';

const PORT = Number(process.env.PORT ?? 4322);
const AUTH_MODE = (process.env.AUTH_MODE ?? 'basic').toLowerCase();
const STUDIO_USER = process.env.STUDIO_USER ?? '';
const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD ?? '';
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER ?? 'resend').toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const BREVO_API_KEY = process.env.BREVO_API_KEY ?? '';
const SMTP_HOST = process.env.SMTP_HOST ?? '';
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_LOGIN = process.env.SMTP_LOGIN ?? '';
const SMTP_PASS = process.env.SMTP_PASS ?? '';
const SMTP_SECURITY = (process.env.SMTP_SECURITY ?? 'starttls').toLowerCase();
const MAIL_FROM = process.env.MAIL_FROM ?? '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
const SESSION_SECRET = process.env.SESSION_SECRET ?? '';
const MAGIC_ALLOWED_EMAILS = (process.env.MAGIC_ALLOWED_EMAILS ?? '')
  .split(',').map(normalizeEmail).filter(Boolean);
const PUBLIC_SIGNUP_ENABLED = process.env.PUBLIC_SIGNUP_ENABLED === 'true';
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'folioflash_session';
const isSecure = PUBLIC_BASE_URL.startsWith('https://');
const EMAIL_PROVIDER_LABEL = EMAIL_PROVIDER === 'brevo-smtp' ? 'Brevo SMTP' : EMAIL_PROVIDER === 'brevo-api' ? 'Brevo API' : 'Resend';

if (!['basic', 'magic'].includes(AUTH_MODE)) throw new Error('AUTH_MODE must be basic or magic');
if (AUTH_MODE === 'basic' && (!STUDIO_USER || !STUDIO_PASSWORD)) {
  throw new Error('STUDIO_USER and STUDIO_PASSWORD are required in basic auth mode');
}
if (!['resend', 'brevo-api', 'brevo-smtp'].includes(EMAIL_PROVIDER)) {
  throw new Error('EMAIL_PROVIDER must be resend, brevo-api, or brevo-smtp');
}
const emailProviderConfigured = EMAIL_PROVIDER === 'brevo-smtp'
  ? Boolean(SMTP_HOST && SMTP_PORT && SMTP_LOGIN && SMTP_PASS)
  : Boolean(EMAIL_PROVIDER === 'brevo-api' ? BREVO_API_KEY : RESEND_API_KEY);
const EMAIL_SETUP_COPY = emailProviderConfigured
  ? `${EMAIL_PROVIDER_LABEL} est configuré. Il reste à vérifier l’expéditeur et à autoriser les adresses pilotes avant d’ouvrir les liens magiques.`
  : `Le lien magique n’est pas activé : il faut configurer ${EMAIL_PROVIDER_LABEL} et un expéditeur vérifié.`;
if (AUTH_MODE === 'magic' && (!emailProviderConfigured || !MAIL_FROM || SESSION_SECRET.length < 32 || !PUBLIC_BASE_URL.startsWith('https://'))) {
  throw new Error(`Magic auth requires valid ${EMAIL_PROVIDER} credentials, MAIL_FROM, SESSION_SECRET, and an HTTPS PUBLIC_BASE_URL`);
}
if (AUTH_MODE === 'magic' && !PUBLIC_SIGNUP_ENABLED && MAGIC_ALLOWED_EMAILS.length === 0) {
  throw new Error('Magic auth requires MAGIC_ALLOWED_EMAILS until public signup is deliberately enabled');
}
const STUDIO_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = process.env.TEMPLATE_DIR ?? path.resolve(STUDIO_DIR, '../template-folio');
const DATA_DIR = process.env.STUDIO_DATA_DIR ?? path.join(STUDIO_DIR, 'data');
const stateFile = path.join(DATA_DIR, 'state.json');
mkdirSync(DATA_DIR, { recursive: true });
let savedState = { sites: [], credits: [], users: [], magicLinks: [], sessions: [] };
try {
  if (existsSync(stateFile)) savedState = JSON.parse(readFileSync(stateFile, 'utf8'));
} catch {
  console.error('[state] unable to parse state.json; starting with empty state');
}
const sites = new Map(savedState.sites ?? []);
const credits = new Map(savedState.credits ?? []); // test: 3 free edits per site owner
const users = new Map(savedState.users ?? []);
const magicLinks = new Map(savedState.magicLinks ?? []);
const sessions = new Map(savedState.sessions ?? []);
const authLimits = new Map();
let lastLiveDir = null; // abs path of the most recent live dist/ — served on /demo
let seq = Math.max(0, ...[...sites.keys()].map((id) => Number(id.replace('site_', '')) || 0));
for (const site of [...sites.values()].reverse()) {
  if (site.status === 'live' && site.distDir) {
    const candidate = path.resolve(STUDIO_DIR, site.distDir);
    if (existsSync(candidate)) {
      lastLiveDir = candidate;
      break;
    }
  }
}

function saveState() {
  const temporaryStateFile = path.join(DATA_DIR, 'state.json.tmp');
  writeFileSync(temporaryStateFile, `${JSON.stringify({
    sites: [...sites], credits: [...credits], users: [...users],
    magicLinks: [...magicLinks], sessions: [...sessions],
  }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryStateFile, stateFile);
}

const hashSession = (token) => createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const maskEmail = (email) => {
  const [local, domain] = String(email).split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
};

function cleanupAuthState() {
  const now = Date.now();
  for (const [tokenHash, record] of magicLinks) {
    if (record.expiresAt <= now) magicLinks.delete(tokenHash);
  }
  for (const [tokenHash, record] of sessions) {
    if (record.expiresAt <= now) sessions.delete(tokenHash);
  }
  for (const [key, record] of authLimits) {
    if (record.resetAt <= now) authLimits.delete(key);
  }
}

function sessionUser(req) {
  if (AUTH_MODE === 'basic') return { email: STUDIO_USER, mode: 'basic' };
  const token = parseCookies(req.headers.cookie ?? '')[SESSION_COOKIE];
  if (!token) return null;
  const key = hashSession(token);
  const record = sessions.get(key);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) {
      sessions.delete(key);
      saveState();
    }
    return null;
  }
  return users.get(record.email) ?? null;
}

function allowMagicLinkRequest(email) {
  cleanupAuthState();
  const now = Date.now();
  const limits = [[`email:${email}`, 4], ['global', 40]];
  for (const [key, max] of limits) {
    const record = authLimits.get(key);
    if (record && record.count >= max && record.resetAt > now) return false;
  }
  for (const [key] of limits) {
    const record = authLimits.get(key);
    if (record && record.resetAt > now) record.count += 1;
    else authLimits.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }
  return true;
}

async function sendMagicLink(email, link) {
  const isBrevoApi = EMAIL_PROVIDER === 'brevo-api';
  const sender = MAIL_FROM.match(/^(.*?)\s*<([^<>]+)>$/);
  const senderEmail = sender ? sender[2].trim() : MAIL_FROM.trim();
  const senderName = sender ? sender[1].replace(/^"|"$/g, '').trim() : 'Folioflash';
  const text = `Voici ton lien de connexion Folioflash. Il expire dans 15 minutes :\n\n${link}\n\nSi tu n'as pas demandé ce lien, ignore ce message.`;
  const html = `<div style="font-family:Arial,sans-serif;background:#0B0B0C;color:#F5F3EF;padding:36px"><h1 style="font-family:Georgia,serif;color:#C6A66B">Folioflash</h1><p>Ton lien de connexion expire dans 15 minutes.</p><p><a href="${link}" style="display:inline-block;background:#C6A66B;color:#0B0B0C;padding:14px 20px;text-decoration:none">Ouvrir mon Studio</a></p><p>Si tu n'as pas demandé ce lien, ignore ce message.</p></div>`;
  if (EMAIL_PROVIDER === 'brevo-smtp') {
    const secure = ['ssl', 'tls', 'smtps'].includes(SMTP_SECURITY) || SMTP_PORT === 465;
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure,
      requireTLS: !secure,
      auth: { user: SMTP_LOGIN, pass: SMTP_PASS },
      tls: { minVersion: 'TLSv1.2' },
    });
    try {
      await transporter.sendMail({ from: MAIL_FROM, to: email, subject: 'Ton lien de connexion Folioflash', text, html });
    } finally {
      transporter.close();
    }
    return;
  }

  const response = await fetch(isBrevoApi ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      ...(isBrevoApi ? { 'api-key': BREVO_API_KEY } : { authorization: `Bearer ${RESEND_API_KEY}` }),
      'content-type': 'application/json',
    },
    body: JSON.stringify(isBrevoApi ? {
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      subject: 'Ton lien de connexion Folioflash',
      textContent: text,
      htmlContent: html,
    } : {
      from: MAIL_FROM,
      to: [email],
      subject: 'Ton lien de connexion Folioflash',
      text,
      html,
    }),
  });
  if (!response.ok) throw new Error(`email provider returned ${response.status}`);
}

function setSessionCookie(res, token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function logJob(entry) {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(
    path.join(DATA_DIR, 'jobs.jsonl'),
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

const BRAND_STYLE = `<style>
@font-face{font-family:Inter;src:url('/brand-fonts/inter.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap}@font-face{font-family:'Playfair Display';src:url('/brand-fonts/playfair-display.woff2') format('woff2');font-style:normal;font-weight:400 900;font-display:swap}:root{color-scheme:dark;--night:#0b0b0c;--panel:#151618;--cream:#f5f3ef;--muted:#d8d3ca;--gold:#c6a66b;--gold-deep:#9b7a3d;--line:#353433;--serif:'Playfair Display',Georgia,serif;--sans:Inter,ui-sans-serif,system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;min-width:320px;background:radial-gradient(ellipse at 80% 0%,#25211a 0,transparent 35%),var(--night);color:var(--cream);font-family:var(--sans);line-height:1.55}a{color:var(--gold);text-underline-offset:.22em}button,input,textarea,select{font:inherit}button{cursor:pointer}.shell{width:min(100% - 40px,1040px);margin:auto}.topbar{height:76px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}.brand{display:inline-flex;align-items:center;gap:12px;color:var(--cream);font-weight:600;text-decoration:none;letter-spacing:.02em}.brand-mark{width:13px;height:18px;background:var(--gold);clip-path:polygon(58% 0,100% 0,72% 42%,100% 42%,30% 100%,46% 55%,14% 55%)}.brand small{display:block;color:var(--muted);font-size:11px;font-weight:400;letter-spacing:.12em;text-transform:uppercase}.account{display:flex;align-items:center;gap:18px;color:var(--muted);font-size:13px}.logout{border:1px solid var(--line);border-radius:4px;background:transparent;color:var(--cream);padding:8px 12px}.hero{padding:64px 0 36px}.eyebrow{color:var(--gold);font-size:12px;letter-spacing:.16em;text-transform:uppercase}.hero h1,.login-card h1{font:500 clamp(38px,6vw,62px)/1.04 var(--serif);letter-spacing:-.035em;margin:12px 0}.hero p{color:var(--muted);max-width:580px}.workspace{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:22px;padding-bottom:72px}.panel{background:linear-gradient(145deg,#191a1b,var(--panel));border:1px solid var(--line);padding:clamp(20px,4vw,34px)}.panel h2{font:500 25px/1.2 var(--serif);margin:0 0 8px}.hint{color:var(--muted);font-size:13px;margin:0 0 24px}.field{display:grid;gap:7px;margin:16px 0}.field label{font-size:13px;color:var(--muted)}.field input,.field textarea,.field select{width:100%;border:1px solid #45423d;background:#0f1011;color:var(--cream);padding:12px 13px;border-radius:2px}.field textarea{min-height:138px;resize:vertical}.field input:focus,.field textarea:focus,.field select:focus{outline:2px solid var(--gold);outline-offset:2px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.primary{border:0;border-radius:4px;background:var(--gold);color:#0b0b0c;font-weight:650;padding:13px 18px;min-height:48px}.primary:hover{background:#d6b77f}.secondary{border:1px solid var(--gold-deep);border-radius:4px;background:transparent;color:var(--cream);padding:11px 14px}.mic-row{display:flex;gap:10px;align-items:center}.mic-row select{max-width:105px}.status{min-height:28px;margin-top:16px;color:var(--muted);font-size:14px}.site-list{display:grid;gap:10px;margin-top:22px}.site-item{border-top:1px solid var(--line);padding:14px 0;display:flex;justify-content:space-between;gap:12px;font-size:14px}.site-item small{display:block;color:var(--muted);margin-top:3px}.credits{color:var(--gold);white-space:nowrap}.login-wrap{min-height:100svh;display:grid;place-items:center;padding:24px}.login-card{width:min(100%,440px);border:1px solid var(--line);background:linear-gradient(145deg,#191a1b,#111213);padding:clamp(26px,6vw,46px)}.login-card h1{font-size:42px}.login-card p{color:var(--muted)}.login-card .field{margin:26px 0}.login-card button{width:100%}.footnote{color:var(--muted);font-size:12px;margin-top:20px}.skip{position:absolute;left:12px;top:-80px;background:var(--gold);color:var(--night);padding:10px;z-index:5}.skip:focus{top:12px}:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
@media(max-width:760px){.workspace{grid-template-columns:1fr}.hero{padding-top:42px}.shell{width:min(100% - 28px,1040px)}.topbar{height:68px}.account{gap:8px;font-size:11px}.form-row{grid-template-columns:1fr}.panel{padding:21px}}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.hidden{display:none!important}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important}}
</style>`;

const LOGIN_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0B0C"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Connexion — Folioflash</title>${BRAND_STYLE}</head><body><main class="login-wrap"><section class="login-card" aria-labelledby="login-title"><a class="brand" href="/login"><span class="brand-mark" aria-hidden="true"></span><span>Folioflash<small>Studio portfolio</small></span></a><p class="eyebrow" style="margin-top:42px">Bienvenue</p><h1 id="login-title">Ton espace créatif.</h1><p>Entre ton adresse email. Nous t’enverrons un lien de connexion à usage unique.</p><form id="login-form"><div class="field"><label for="email">Adresse email</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="toi@exemple.fr"></div><button class="primary" id="login-submit" type="submit">M’envoyer un lien magique</button></form><p class="status" id="login-status" role="status" aria-live="polite"></p><p class="footnote">Le lien expire après 15 minutes. Aucun mot de passe à retenir.</p></section></main><script>
const loginForm=document.getElementById('login-form');const loginStatus=document.getElementById('login-status');const loginButton=document.getElementById('login-submit');if(new URLSearchParams(location.search).has('expired'))loginStatus.textContent='Ce lien est expiré ou déjà utilisé. Demande-en un nouveau.';
loginForm.addEventListener('submit',async(event)=>{event.preventDefault();loginButton.disabled=true;loginStatus.textContent='Envoi en cours…';try{const response=await fetch('/api/auth/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Impossible d’envoyer le lien. Réessaie plus tard.');loginStatus.textContent=result.message;}catch(error){loginStatus.textContent=error.message;}finally{loginButton.disabled=false;}});
</script></body></html>`;

const LOGIN_SETUP_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0B0C"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Connexion — Folioflash</title>${BRAND_STYLE}</head><body><main class="login-wrap"><section class="login-card"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>Folioflash<small>Portfolio studio</small></span></a><p class="eyebrow" style="margin-top:42px">Connexion par email</p><h1>Encore une étape.</h1><p>${EMAIL_SETUP_COPY}</p><p class="footnote"><a href="/studio">Accès opérateur provisoire</a> · <a href="/">Retour à Folioflash</a></p></section></main></body></html>`;

const MARKETING_STYLE = `<style>
.landing{width:min(100% - 40px,1120px);margin:auto}.landing-nav{height:82px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.landing-navlinks{display:flex;align-items:center;gap:24px}.landing-navlinks a{color:var(--muted);font-size:13px;text-decoration:none}.landing-navlinks a:hover{color:var(--gold)}.lang-switch{border:1px solid var(--line);padding:7px 10px!important;color:var(--cream)!important}.landing-hero{min-height:600px;display:grid;grid-template-columns:1.02fr .98fr;gap:40px;align-items:center;padding:68px 0}.landing-copy h1{max-width:640px;margin:18px 0 22px;font:500 clamp(48px,7vw,86px)/.99 var(--serif);letter-spacing:-.055em}.landing-copy h1 em{color:var(--gold);font-style:normal}.landing-copy>p{max-width:520px;color:var(--muted);font-size:17px}.landing-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.landing-cta{display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:0 18px;text-decoration:none;font-size:13px;font-weight:650}.landing-cta--gold{background:var(--gold);color:var(--night)}.landing-cta--outline{border:1px solid var(--line);color:var(--cream)}.landing-note{margin-top:20px!important;font-size:12px!important}.landing-art{position:relative;min-height:430px;display:grid;place-items:center}.art-glow{position:absolute;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,#9b7a3d55,transparent 68%);filter:blur(14px)}.folio-card{position:relative;width:min(100%,420px);min-height:410px;padding:28px;background:#f5f3ef;color:#0b0b0c;transform:rotate(2deg);box-shadow:0 24px 80px #0008}.folio-card-top{display:flex;justify-content:space-between;color:#716b61;font-size:10px;letter-spacing:.14em;text-transform:uppercase}.folio-card h2{max-width:300px;margin:54px 0 8px;font:500 51px/.98 var(--serif);letter-spacing:-.05em}.folio-card p{max-width:270px;color:#5d5850;font-size:12px}.folio-card-line{height:1px;background:#d8d3ca;margin:26px 0 18px}.folio-projects{display:grid;grid-template-columns:1fr 1fr;gap:10px}.folio-project{min-height:84px;display:flex;align-items:end;padding:10px;background:#c6a66b;color:#0b0b0c;font:500 16px/1.1 var(--serif)}.folio-project:nth-child(2){background:#151618;color:#f5f3ef}.landing-proof{border-block:1px solid var(--line);padding:19px 0;color:var(--muted);font-size:13px}.landing-proof strong{color:var(--gold);font-weight:500}.landing-section{padding:88px 0}.landing-section h2{margin:0;font:500 clamp(34px,4vw,52px)/1.08 var(--serif);letter-spacing:-.035em}.landing-section-intro{max-width:550px;color:var(--muted)}.landing-features{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px}.landing-feature{border:1px solid var(--line);padding:24px;background:linear-gradient(145deg,#18191a,#111213)}.landing-feature span{color:var(--gold);font-size:12px}.landing-feature h3{margin:25px 0 8px;font:500 23px/1.2 var(--serif)}.landing-feature p{margin:0;color:var(--muted);font-size:13px}.landing-footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--line);padding:25px 0 35px;color:var(--muted);font-size:12px}.landing-footer a{color:var(--gold)}
@media(max-width:760px){.landing{width:min(100% - 28px,1120px)}.landing-nav{height:70px}.landing-navlinks{gap:13px}.landing-navlinks a{font-size:11px}.landing-navlinks .nav-demo{display:none}.landing-hero{grid-template-columns:1fr;gap:5px;padding:52px 0}.landing-copy h1{font-size:clamp(48px,13vw,68px)}.landing-copy>p{font-size:15px}.landing-art{min-height:360px}.folio-card{width:min(90%,360px);min-height:340px;padding:22px}.folio-card h2{margin-top:38px;font-size:44px}.folio-project{min-height:68px}.landing-section{padding:60px 0}.landing-features{grid-template-columns:1fr}.landing-feature{padding:20px}.landing-feature h3{margin-top:12px}.landing-footer{flex-direction:column}}
</style>`;

const LANDING_FR = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0B0C"><meta name="description" content="Folioflash transforme ton brief en portfolio rapide, dans un style qui te ressemble."><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Folioflash — Ton portfolio, ton style</title>${BRAND_STYLE}${MARKETING_STYLE}</head><body><header class="landing"><nav class="landing-nav" aria-label="Navigation principale"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>Folioflash<small>Portfolio studio</small></span></a><div class="landing-navlinks"><a href="#comment">Comment ça marche</a><a class="nav-demo" href="/demo/">La démo</a><a class="lang-switch" href="/?lang=en" lang="en">EN</a></div></nav><main><section class="landing-hero"><div class="landing-copy"><p class="eyebrow">Le studio portfolio nouvelle génération</p><h1>Ton portfolio.<br><em>Ta vision.</em><br>Ton style.</h1><p>Colle ton LinkedIn ou raconte ton activité. Folioflash compose un portfolio rapide, dans un style qui parle ton métier.</p><div class="landing-actions"><a class="landing-cta landing-cta--gold" href="/login">Créer mon portfolio <span aria-hidden="true">↗</span></a><a class="landing-cta landing-cta--outline" href="/demo/">Voir la démo</a></div><p class="landing-note">Beta en cours · Prix au coût réel pendant le test</p></div><div class="landing-art" aria-label="Aperçu stylisé d’un portfolio généré"><div class="art-glow"></div><article class="folio-card"><div class="folio-card-top"><span>Portfolio · Illustration</span><span>2026</span></div><h2>Léa<br>Marceau</h2><p>Des histoires tendres, dessinées à la gouache et au numérique.</p><div class="folio-card-line"></div><div class="folio-projects"><div class="folio-project">Lulu la loutre</div><div class="folio-project">Petites Oreilles</div></div></article></div></section><div class="landing-proof"><strong>Un style à ton image.</strong> Géologue, sound designer, illustratrice : ton portfolio adopte les codes de ton métier.</div><section class="landing-section" id="comment"><p class="eyebrow">Simple, du brief au site</p><h2>Tu apportes l’histoire.<br>Folioflash compose la page.</h2><p class="landing-section-intro">Pas de builder à apprendre. Tu écris ou dictes ce que tu veux montrer ; si tu n’as pas de direction visuelle, l’IA en propose une. Tu gardes la main sur le résultat.</p><div class="landing-features"><article class="landing-feature"><span>01 · Ton brief</span><h3>Les mots d’abord</h3><p>Présente ton activité, tes projets et les personnes que tu veux toucher. Tu peux dicter ton brief.</p></article><article class="landing-feature"><span>02 · Ta direction</span><h3>Un style qui te ressemble</h3><p>Tu donnes une préférence ou le modèle propose une piste visuelle adaptée à ton univers.</p></article><article class="landing-feature"><span>03 · Ton site</span><h3>Partage-le</h3><p>Prévisualise, ajuste par prompt, et publie quand c’est prêt.</p></article></div></section></main><footer class="landing-footer"><span>Folioflash · Beta privée</span><span>Simple, rapide, à ton nom.</span><a href="/login">Accéder au Studio</a></footer></header></body></html>`;

const LANDING_EN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0B0C"><meta name="description" content="Folioflash turns your brief into a fast portfolio, in a style that feels like you."><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Folioflash — Your portfolio, your style</title>${BRAND_STYLE}${MARKETING_STYLE}</head><body><header class="landing"><nav class="landing-nav" aria-label="Main navigation"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>Folioflash<small>Portfolio studio</small></span></a><div class="landing-navlinks"><a href="#how">How it works</a><a class="nav-demo" href="/demo/">The demo</a><a class="lang-switch" href="/" lang="fr">FR</a></div></nav><main><section class="landing-hero"><div class="landing-copy"><p class="eyebrow">The next-generation portfolio studio</p><h1>Your portfolio.<br><em>Your vision.</em><br>Your style.</h1><p>Paste your LinkedIn or tell your story. Folioflash builds a fast portfolio — in a style that speaks your trade.</p><div class="landing-actions"><a class="landing-cta landing-cta--gold" href="/login">Create my portfolio <span aria-hidden="true">↗</span></a><a class="landing-cta landing-cta--outline" href="/demo/">See the demo</a></div><p class="landing-note">Beta in progress · At-cost pricing during testing</p></div><div class="landing-art" aria-label="Stylized preview of a generated portfolio"><div class="art-glow"></div><article class="folio-card"><div class="folio-card-top"><span>Portfolio · Illustration</span><span>2026</span></div><h2>Léa<br>Marceau</h2><p>Tender stories, drawn with gouache and digital brushstrokes.</p><div class="folio-card-line"></div><div class="folio-projects"><div class="folio-project">Lulu the Otter</div><div class="folio-project">Petites Oreilles</div></div></article></div></section><div class="landing-proof"><strong>A style that fits your craft.</strong> Geologist, sound designer, illustrator: your portfolio speaks your trade’s language.</div><section class="landing-section" id="how"><p class="eyebrow">From brief to live site</p><h2>You bring the story.<br>Folioflash shapes the page.</h2><p class="landing-section-intro">No builder to learn. Write or dictate what you want to show; if you have no visual direction in mind, AI suggests one. You stay in control.</p><div class="landing-features"><article class="landing-feature"><span>01 · Your brief</span><h3>Start with your words</h3><p>Describe your work, projects and the people you want to reach. You can dictate your brief.</p></article><article class="landing-feature"><span>02 · Your direction</span><h3>A style that feels like you</h3><p>Give a preference or let the model suggest a visual direction based on your work.</p></article><article class="landing-feature"><span>03 · Your site</span><h3>Share it</h3><p>Preview, refine by prompt, and publish when ready.</p></article></div></section></main><footer class="landing-footer"><span>Folioflash · Private beta</span><span>Simple, fast, yours.</span><a href="/login">Open the Studio</a></footer></header></body></html>`;

function renderLanding(lang, isLoggedIn = false) {
  const page = (lang === 'en' ? LANDING_EN : LANDING_FR)
    .replace('<body><header class="landing">', '<body><div class="landing"><header>')
    .replace('</nav><main>', '</nav></header><main>')
    .replace('</footer></header></body>', '</footer></div></body>');
  return isLoggedIn ? page.replaceAll('href="/login"', 'href="/studio"') : page;
}

const FORM = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0B0C"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Studio — Folioflash</title>${BRAND_STYLE}</head><body><a class="skip" href="#main">Aller au contenu</a><div class="shell"><header class="topbar"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>Folioflash<small>Studio portfolio</small></span></a><div class="account"><span>@@EMAIL@@</span><button id="logout" class="logout @@LOGOUT_CLASS@@" type="button">Déconnexion</button></div></header><main id="main"><section class="hero"><p class="eyebrow">Ton site, à ton image</p><h1>Un portfolio qui te ressemble.</h1><p>Décris ton univers. Si tu n’as pas d’idée de style, Folioflash en proposera une à partir de ton activité et de tes projets.</p></section><div class="workspace"><section class="panel"><h2>Créer un portfolio</h2><p class="hint">3 étapes, 5 minutes. Ton site sera généré en français et en anglais, automatiquement.</p><form id="create-form"><div class="form-row"><div class="field"><label for="name">Étape 1 — Nom affiché</label><input id="name" name="name" autocomplete="name" required maxlength="100" placeholder="Léa Marceau"></div><div class="field"><label for="craft">Ton métier</label><input id="craft" name="craft" required maxlength="100" placeholder="Illustratrice jeunesse"></div></div><div class="field"><label for="public-email">Email de contact public <span>(facultatif)</span></label><input id="public-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="bonjour@tonsite.fr"></div><div class="field"><label for="style">Style souhaité <span>(facultatif)</span></label><input id="style" name="stylePreference" maxlength="160" placeholder="Ex. coloré et ludique, inspiré de la gouache"></div><div class="field"><label for="profile">Étape 2 — Colle ton LinkedIn <span>(recommandé)</span></label><textarea id="profile" name="profileText" rows="4" maxlength="8000" placeholder="Copie-colle ton résumé LinkedIn ou ton CV : postes, expériences, formations. Exemple : « 2021-2024 Designer produit chez Atelier Nord : refonte du site vitrine, +40 % de contacts… »"></textarea><p class="hint">Astuce : sur LinkedIn, Réglages → Confidentialité → « Obtenir une copie de tes données ». Tu reliras tout avant publication.</p></div><div class="field"><label for="prompt">Étape 3 — Raconte le reste avec tes mots</label><textarea id="prompt" name="prompt" required maxlength="5000" placeholder="Tes 2-3 projets dont tu es fier, ton style de travail, les clients que tu vises. Exemple : « J’ai réalisé l’identité du café Moiré et une fresque de 12 m pour une médiathèque… »"></textarea><div class="mic-row"><button type="button" id="mic" class="secondary">Dicter mon brief</button></div></div><button class="primary" id="create-submit" type="submit">Générer ma première version</button></form><p class="status" id="app-status" role="status" aria-live="polite"></p><p id="view-link" class="hidden" style="margin-top:0.5rem"><a class="primary" id="view-link-a" style="display:inline-block;text-decoration:none" href="#" target="_blank" rel="noopener">Voir mon portfolio ↗</a></p><h2 style="margin-top:2.2rem">Faire évoluer en parlant</h2><p class="hint">Choisis un portfolio, dis ce que tu veux changer. Une seule version en ligne, 1 crédit par modification.</p><form id="edit-form"><div class="field"><label for="edit-site">Mon portfolio</label><select id="edit-site" name="siteId"></select></div><div class="field"><label for="edit-prompt">Que veux-tu changer ?</label><textarea id="edit-prompt" name="prompt" rows="3" maxlength="2000" placeholder="Ex. passe en thème sombre, mets la fresque en premier…"></textarea><div class="mic-row"><button type="button" id="mic2" class="secondary">Dicter</button></div></div><button class="primary" id="edit-submit" type="submit">Modifier (1 crédit)</button></form></section><aside class="panel"><p class="eyebrow">Mes portfolios</p><h2>Mes sites</h2><p class="hint">Tes projets et modifications apparaîtront ici.</p><div class="site-list" id="site-list"></div><p class="footnote">Les images seront bientôt disponibles.</p></aside></div></main></div><script>
const statusBox=document.getElementById('app-status');const createForm=document.getElementById('create-form');const createButton=document.getElementById('create-submit');const siteList=document.getElementById('site-list');
async function api(url,options){const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw new Error(data.error||'Une erreur est survenue.');return data;}
async function refreshSites(){try{const list=await api('/api/sites');const editSelect=document.getElementById('edit-site');const current=editSelect.value;editSelect.replaceChildren();siteList.replaceChildren();for(const site of list){const option=document.createElement('option');option.value=site.id;option.textContent=site.name;editSelect.append(option);const item=document.createElement('div');item.className='site-item';const info=document.createElement('span');info.textContent=site.name;const meta=document.createElement('small');meta.textContent=site.status==='live'?'En ligne':'Brouillon';info.append(meta);if(site.status==='live'&&site.slug){const view=document.createElement('div');const link=document.createElement('a');link.href='/s/'+encodeURIComponent(site.slug);link.target='_blank';link.rel='noopener';link.textContent='Voir ↗';view.append(link);info.append(view);}const credits=document.createElement('span');credits.className='credits';credits.textContent=(site.credits??0)+' crédits test';item.append(info,credits);siteList.append(item);}if(current)editSelect.value=current;}catch(error){siteList.textContent=error.message;}}
document.getElementById('mic').addEventListener('click',()=>{const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){statusBox.textContent='La dictée n’est pas disponible dans ce navigateur. Tu peux écrire ton brief.';return;}const recognition=new SpeechRecognition();recognition.lang='fr-FR';recognition.interimResults=false;recognition.onresult=(event)=>{const promptField=document.getElementById('prompt');promptField.value+=(promptField.value?' ':'')+event.results[0][0].transcript;};recognition.onerror=()=>{statusBox.textContent='La dictée a échoué. Essaie à nouveau ou écris ton brief.';};recognition.start();statusBox.textContent='Je t’écoute…';recognition.onend=()=>{if(statusBox.textContent==='Je t’écoute…')statusBox.textContent='';};});
createForm.addEventListener('submit',async(event)=>{event.preventDefault();createButton.disabled=true;document.getElementById('view-link').classList.add('hidden');statusBox.textContent='Création du portfolio…';try{const payload=Object.fromEntries(new FormData(createForm));const site=await api('/api/sites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});statusBox.textContent='Génération du contenu et du site…';const result=await api('/api/sites/'+encodeURIComponent(site.id)+'/v1',{method:'POST'});statusBox.textContent='Ta première version est en ligne. Style proposé : '+(result.designDirection||'direction visuelle adaptée à tes projets')+'.';const viewLink=document.getElementById('view-link-a');viewLink.href='/s/'+encodeURIComponent(result.slug||site.slug);document.getElementById('view-link').classList.remove('hidden');createForm.reset();await refreshSites();}catch(error){statusBox.textContent=error.message;}finally{createButton.disabled=false;}});
const editForm=document.getElementById('edit-form');const editButton=document.getElementById('edit-submit');
function dictate(targetId){const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){statusBox.textContent='La dictée n’est pas disponible dans ce navigateur. Tu peux écrire ta modification.';return;}const recognition=new SpeechRecognition();recognition.lang='fr-FR';recognition.interimResults=false;recognition.onresult=(event)=>{const field=document.getElementById(targetId);field.value+=(field.value?' ':'')+event.results[0][0].transcript;};recognition.onerror=()=>{statusBox.textContent='La dictée a échoué. Essaie à nouveau ou écris ta modification.';};recognition.start();statusBox.textContent='Je t’écoute…';recognition.onend=()=>{if(statusBox.textContent==='Je t’écoute…')statusBox.textContent='';};}
document.getElementById('mic2').addEventListener('click',()=>dictate('edit-prompt'));
editForm.addEventListener('submit',async(event)=>{event.preventDefault();editButton.disabled=true;document.getElementById('view-link').classList.add('hidden');statusBox.textContent='Modification en cours…';try{const siteId=document.getElementById('edit-site').value;const prompt=document.getElementById('edit-prompt').value;const result=await api('/api/sites/'+encodeURIComponent(siteId)+'/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});statusBox.textContent='C’est en ligne. ('+(result.credits??0)+' crédits restants)';const viewLink=document.getElementById('view-link-a');viewLink.href='/s/'+encodeURIComponent(result.slug);document.getElementById('view-link').classList.remove('hidden');document.getElementById('edit-prompt').value='';await refreshSites();}catch(error){statusBox.textContent=error.message;}finally{editButton.disabled=false;}});
document.getElementById('logout').addEventListener('click',async()=>{try{await fetch('/api/auth/logout',{method:'POST'});}finally{window.location.href='/login';}});refreshSites();
</script></body></html>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/** Serve a built dist/ dir. /demo serves the latest live site; /s/<slug> serves one site. */
function serveStaticDir(rootDir, pathname, prefix, res) {
  if (!rootDir) {
    send(res, 404, { error: 'no live site yet — generate a V1 first' });
    return;
  }
  let rel = pathname === prefix || pathname === prefix + '/' ? 'index.html' : pathname.slice(prefix.length + 1);
  const file = path.normalize(path.join(rootDir, rel));
  if (!file.startsWith(rootDir) || !existsSync(file) || statSync(file).isDirectory()) {
    // Fallback to extensionless-route convention: <rel>/index.html
    const nested = path.join(rootDir, rel, 'index.html');
    if (nested.startsWith(rootDir) && existsSync(nested)) {
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

function serveDemo(req, res, pathname) {
  serveStaticDir(lastLiveDir, pathname, '/demo', res);
}

function absDist(site) {
  if (!site || site.status !== 'live' || !site.distDir) return null;
  const candidate = path.resolve(STUDIO_DIR, site.distDir);
  return existsSync(candidate) ? candidate : null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const m = url.pathname.match(/^\/api\/sites\/([^/]+)(\/(v1|edit))?$/);
  addSecurityHeaders(res);
  const requiresAuth = url.pathname === '/studio'
    || url.pathname === '/api/sites'
    || url.pathname.startsWith('/api/sites/')
    || url.pathname === '/api/auth/logout';
  let currentUser = null;

  if (AUTH_MODE === 'basic' && requiresAuth) {
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
    currentUser = { email: STUDIO_USER, mode: 'basic' };
  } else if (AUTH_MODE === 'magic' && requiresAuth) {
    currentUser = sessionUser(req);
    if (!currentUser) {
      if (req.method === 'GET' && url.pathname === '/studio') {
        res.statusCode = 303;
        res.setHeader('Location', '/login');
        res.end();
      } else {
        send(res, 401, { error: 'Connexion requise. Demande un nouveau lien magique.' });
      }
      return;
    }
  } else if (AUTH_MODE === 'magic' && url.pathname === '/') {
    currentUser = sessionUser(req);
  }

  if (req.method === 'GET' && url.pathname === '/login') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(AUTH_MODE === 'magic' ? LOGIN_PAGE : LOGIN_SETUP_PAGE);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/request') {
    if (AUTH_MODE !== 'magic') {
      send(res, 503, { error: 'La connexion par email n’est pas encore activée.' });
      return;
    }
    try {
      const body = await readJson(req);
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        send(res, 400, { error: 'Saisis une adresse email valide.' });
        return;
      }
      if (!allowMagicLinkRequest(email)) {
        send(res, 429, { error: 'Trop de demandes. Attends quelques minutes puis réessaie.' });
        return;
      }
      if (!PUBLIC_SIGNUP_ENABLED && !MAGIC_ALLOWED_EMAILS.includes(email)) {
        send(res, 202, { message: 'Si cette adresse peut recevoir un lien, tu le trouveras bientôt dans ta boîte email.' });
        return;
      }
      for (const [key, record] of magicLinks) {
        if (record.email === email) magicLinks.delete(key);
      }
      const token = createOpaqueToken();
      const tokenHash = digestToken(token);
      magicLinks.set(tokenHash, { email, createdAt: Date.now(), expiresAt: Date.now() + MAGIC_LINK_TTL_MS });
      saveState();
      const link = `${PUBLIC_BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`;
      try {
        await sendMagicLink(email, link);
      } catch (error) {
        magicLinks.delete(tokenHash);
        saveState();
        console.error(`[auth] email delivery failed (${error.message})`);
        send(res, 503, { error: 'Le lien n’a pas pu être envoyé. Réessaie plus tard.' });
        return;
      }
      send(res, 202, { message: 'Si cette adresse peut recevoir un lien, tu le trouveras bientôt dans ta boîte email.' });
    } catch (error) {
      send(res, 400, { error: error.message });
    }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/auth/verify') {
    const token = url.searchParams.get('token') ?? '';
    const record = magicLinks.get(digestToken(token));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!token || !record || record.expiresAt <= Date.now()) {
      res.statusCode = 400;
      res.end(LOGIN_PAGE.replace('Bienvenue', 'Lien expiré').replace('Ton espace créatif.', 'Demande un nouveau lien pour te connecter.'));
      return;
    }
    // A confirmation POST avoids email security scanners consuming one-time links.
    res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Confirmer — Folioflash</title>${BRAND_STYLE}</head><body><main class="login-wrap"><section class="login-card"><a class="brand" href="/login"><span class="brand-mark" aria-hidden="true"></span><span>Folioflash<small>Studio portfolio</small></span></a><p class="eyebrow" style="margin-top:42px">Connexion sécurisée</p><h1>Ouvrir ton Studio&nbsp;?</h1><p>Tu vas te connecter avec <strong>${escapeHtml(maskEmail(record.email))}</strong>. Si cette adresse n’est pas la tienne, ne confirme pas.</p><form method="post" action="/api/auth/verify"><input type="hidden" name="token" value="${escapeHtml(token)}"><button class="primary" type="submit">Confirmer la connexion</button></form><p class="footnote">Le lien expire après 15 minutes et ne peut servir qu’une seule fois.</p></section></main></body></html>`);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/verify') {
    try {
      const contentType = req.headers['content-type'] ?? '';
      let token = '';
      if (contentType.includes('application/json')) {
        token = String((await readJson(req)).token ?? '');
      } else {
        const form = new URLSearchParams(await new Promise((resolve, reject) => {
          let body = '';
          req.on('data', (chunk) => { body += chunk; if (body.length > 10_000) reject(new Error('payload too large')); });
          req.on('end', () => resolve(body));
          req.on('error', reject);
        }));
        token = form.get('token') ?? '';
      }
      const tokenHash = digestToken(token);
      const record = magicLinks.get(tokenHash);
      if (!token || !record || record.expiresAt <= Date.now()) {
        res.statusCode = 303;
        res.setHeader('Location', '/login?expired=1');
        res.end();
        return;
      }
      magicLinks.delete(tokenHash);
      const email = record.email;
      if (!users.has(email)) users.set(email, { email, createdAt: new Date().toISOString() });
      const sessionToken = createOpaqueToken();
      sessions.set(hashSession(sessionToken), { email, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
      saveState();
      setSessionCookie(res, sessionToken, Math.floor(SESSION_TTL_MS / 1000));
      res.statusCode = 303;
      res.setHeader('Location', '/studio');
      res.end();
    } catch (error) {
      send(res, 400, { error: error.message });
    }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    if (AUTH_MODE === 'magic' && currentUser) {
      const token = parseCookies(req.headers.cookie ?? '')[SESSION_COOKIE];
      if (token) sessions.delete(hashSession(token));
      saveState();
      setSessionCookie(res, '', 0);
    }
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const language = url.searchParams.get('lang') === 'en' ? 'en' : 'fr';
    res.end(renderLanding(language, Boolean(currentUser)));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/studio') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(FORM
      .replaceAll('@@EMAIL@@', escapeHtml(currentUser?.email ?? ''))
      .replace('@@LOGOUT_CLASS@@', AUTH_MODE === 'magic' ? '' : 'hidden'));
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/brand-fonts/')) {
    const fontFiles = {
      '/brand-fonts/inter.woff2': path.join(TEMPLATE_DIR, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'),
      '/brand-fonts/playfair-display.woff2': path.join(TEMPLATE_DIR, 'node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2'),
    };
    const fontPath = fontFiles[url.pathname];
    if (!fontPath || !existsSync(fontPath)) {
      send(res, 404, { error: 'font not found' });
      return;
    }
    res.setHeader('Content-Type', 'font/woff2');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(readFileSync(fontPath));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/favicon.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(readFileSync(path.join(STUDIO_DIR, 'public/favicon.svg')));
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/demo' || url.pathname.startsWith('/demo/'))) {
    serveDemo(req, res, url.pathname);
    return;
  }
  const siteMatch = url.pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
  if (req.method === 'GET' && siteMatch) {
    const site = [...sites.values()].find((s) => s.slug === siteMatch[1]);
    const dir = absDist(site);
    if (!dir) {
      send(res, 404, { error: 'site not found or not live yet' });
      return;
    }
    serveStaticDir(dir, url.pathname, `/s/${siteMatch[1]}`, res);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    send(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/sites') {
    const ownedSites = [...sites.values()].filter((site) =>
      AUTH_MODE === 'basic'
        ? !site.ownerEmail || site.ownerEmail === currentUser?.email
        : site.ownerEmail === currentUser?.email,
    );
    send(res, 200, ownedSites.map((site) => ({
      id: site.id,
      slug: site.slug,
      name: site.name,
      status: site.status,
      palette: site.palette,
      credits: credits.get(site.id) ?? 0,
    })));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sites') {
    try {
      const body = await readJson(req);
      const name = String(body.name ?? '').trim();
      const craft = String(body.craft ?? '').trim();
      const prompt = String(body.prompt ?? '').trim();
      const profileText = String(body.profileText ?? '').trim().slice(0, 8000);
      const publicEmail = normalizeEmail(body.email);
      const stylePreference = String(body.stylePreference ?? '').trim().slice(0, 160);
      if (!name || !craft || !prompt) {
        send(res, 400, { error: 'name, craft and prompt are required' });
        return;
      }
      const id = `site_${++seq}`;
      const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const site = {
        id, slug, name, craft, prompt: prompt.slice(0, 5_000), profileText,
        email: publicEmail && isValidEmail(publicEmail) ? publicEmail : '',
        stylePreference,
        ownerEmail: currentUser?.email ?? '',
        palette: ['paper', 'iris', 'forest', 'boucher', 'atelier', 'studio'].includes(body.palette) ? body.palette : undefined,
        status: 'draft',
      };
      sites.set(id, site);
      credits.set(id, 3); // test: 3 free edits, V1 build itself is free
      saveState();
      send(res, 201, { id: site.id, name: site.name, status: site.status, credits: 3 });
    } catch (err) {
      send(res, 400, { error: err.message });
    }
    return;
  }
  if (m && req.method === 'GET' && !m[3]) {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && site.ownerEmail !== currentUser?.email)) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    send(res, 200, { ...site, credits: credits.get(m[1]) ?? 0 });
    return;
  }
  if (m && req.method === 'POST' && (m[3] === 'v1' || m[3] === 'edit')) {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && site.ownerEmail !== currentUser?.email)) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    const kind = m[3];
    try {
      const body = kind === 'edit' ? await readJson(req) : {};
      const editPrompt = kind === 'edit' ? String(body.prompt ?? '').trim() : '';
      const basePrompt = site.profileText
        ? `Profil fourni :\n${site.profileText}\n\nBrief :\n${site.prompt}`
        : site.prompt;
      const prompt = kind === 'edit'
        ? `${basePrompt}\n\nRequested update: ${editPrompt}`
        : basePrompt;
      if (!prompt || (kind === 'edit' && !editPrompt)) {
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
      site.palette = result.palette ?? site.palette;
      site.motif = result.motif ?? site.motif ?? 'cercles';
      site.designDirection = result.designDirection;
      if (result.absDistDir) lastLiveDir = result.absDistDir;
      saveState();
      logJob({ kind: `${kind}-request`, siteId: m[1], slug: site.slug, ...result.usage });
      send(res, 200, {
        id: site.id,
        slug: site.slug,
        name: site.name,
        status: site.status,
        palette: site.palette,
        motif: site.motif,
        designDirection: site.designDirection,
        credits: credits.get(m[1]) ?? 0,
        usage: result.usage,
      });
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
