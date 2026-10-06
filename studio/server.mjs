/**
 * Folioflash Studio — M1 (Node 22+ with built-in SQLite).
 *
 * Pipeline: POST /api/sites → POST /api/sites/:id/v1 (build, free) →
 * POST /api/sites/:id/edit {prompt} (rebuild, 1 credit).
 * Voice input is client-side (Web Speech API, free); server transcription (Whisper) in M2.
 * Real AI when LLM_PROVIDER + LLM_API_KEY are set (see lib/generate.mjs), else local fallback.
 * Auth supports operator Basic mode and customer magic links (requires a verified email sender).
 * TODO(M1): Stripe webhooks, uploads/optimization, customer-domain multi-site routing.
 */
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { runJob } from './lib/pipeline.mjs';
import { createOpaqueToken, digestToken, isValidEmail, normalizeEmail, parseCookies } from './lib/auth.mjs';
import { isDisposableEmail } from './lib/email-policy.mjs';
import { openStore } from './lib/database.mjs';
import { advanceBrief, BRIEF_AGENT_LIMITS, getBriefTurnLimit } from './lib/brief-agent.mjs';

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
const BRIEF_TEST_FREE_EMAILS = (process.env.BRIEF_TEST_FREE_EMAILS ?? '')
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
const store = openStore(DATA_DIR);
const { sites, credits, users, magicLinks, sessions } = store.loadState();
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
  store.saveState({ sites, credits, users, magicLinks, sessions });
}

let recoveredBriefWork = false;
for (const site of sites.values()) {
  if (site.briefBusy) {
    site.briefBusy = false;
    recoveredBriefWork = true;
  }
}
if (recoveredBriefWork) saveState();

function accountFor(email) {
  if (!email) return null;
  let account = users.get(email);
  if (!account) {
    account = {
      email,
      createdAt: new Date().toISOString(),
      firstGenerationUsed: false,
      briefBudgetUsedEur: 0,
      briefTurnsUsed: 0,
      briefTestFreeUsed: false,
    };
    users.set(email, account);
  }
  return account;
}

const BRIEF_WELCOME = 'Salut ! Raconte-moi ce que tu fais, même en vrac. Tu peux commencer par ton nom ou ton pseudo, coller ton LinkedIn/CV ou dicter.';

function hasInternalFreeBrief(email, account = users.get(email)) {
  return BRIEF_TEST_FREE_EMAILS.includes(email) && !account?.briefTestFreeUsed;
}

function canStartBrief(email, account = users.get(email)) {
  return !account?.firstGenerationUsed
    || hasInternalFreeBrief(email, account)
    || (credits.get(email) ?? 0) > 0;
}

function uniquePortfolioSlug(name, siteId, excludeSiteId = '') {
  const base = slugify(name) || `portfolio-${siteId}`;
  if (![...sites.values()].some((site) => site.id !== excludeSiteId && site.slug === base)) return base;
  return `${base}-${siteId.replace(/[^a-z0-9]/gi, '').slice(-8)}`;
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
  store.insertJob({ at: new Date().toISOString(), ...entry });
}

function readJson(req, maxBytes = 200_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodyBytes = 0;
    let settled = false;
    req.on('data', (c) => {
      if (settled) return;
      bodyBytes += c.length;
      if (bodyBytes > maxBytes) {
        settled = true;
        reject(new Error('payload too large'));
        return;
      }
      body += c;
    });
    req.on('end', () => {
      if (settled) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
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

const CONVERSATION_TEMPLATE = readFileSync(path.join(STUDIO_DIR, 'views/conversation.html'), 'utf8');

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

const slugify = (value) => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

function webpDimensions(data) {
  if (data.length < 30 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const chunk = data.toString('ascii', offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > data.length) return null;
    if (chunk === 'VP8X' && length >= 10) {
      return { width: 1 + data.readUIntLE(start + 4, 3), height: 1 + data.readUIntLE(start + 7, 3) };
    }
    if (chunk === 'VP8L' && length >= 5 && data[start] === 0x2f) {
      const width = 1 + ((data[start + 2] & 0x3f) << 8) + data[start + 1];
      const height = 1 + ((data[start + 4] & 0x0f) << 10) + (data[start + 3] << 2) + ((data[start + 2] & 0xc0) >> 6);
      return { width, height };
    }
    if (chunk === 'VP8 ' && length >= 10 && data[start + 3] === 0x9d && data[start + 4] === 0x01 && data[start + 5] === 0x2a) {
      return { width: data.readUInt16LE(start + 6) & 0x3fff, height: data.readUInt16LE(start + 8) & 0x3fff };
    }
    offset = start + length + (length % 2);
  }
  return null;
}

function sanitizedFileName(value) {
  const name = path.basename(String(value ?? 'image.webp')).replace(/[^\p{L}\p{N}._ -]/gu, '').trim().slice(0, 100);
  return name || 'image.webp';
}

function briefProfilePrompt(profile) {
  return [
    `Portfolio pour ${profile.displayName} (${profile.craft}).`,
    `Audience : ${profile.audience || 'non précisée'}. Objectif : ${profile.goal || 'non précisé'}.`,
    `Présentation confirmée : ${profile.bio || 'aucune biographie fournie'}.`,
    `Expériences : ${JSON.stringify(profile.experiences)}.`,
    `Réalisations : ${JSON.stringify(profile.projects)}.`,
    `La personne a confirmé ne pas avoir de projets à montrer : ${profile.noProjectsYet ? 'oui, ne rien inventer' : 'non'}.`,
    `Articles et publications : ${JSON.stringify(profile.articles)}.`,
    `Direction visuelle : ${profile.visual.preference || 'libre, à proposer selon le métier et les réalisations'}. Références : ${JSON.stringify(profile.visual.references)}.`,
    `Composition : ${profile.layout.preference || (profile.layout.cardsJustified ? 'cartes uniquement pour présenter les réalisations utiles' : 'composition éditoriale, pas de cartes par défaut')}.`,
    `Contact : ${JSON.stringify(profile.contact)}.`,
  ].join('\n').slice(0, 5000);
}

function applyBriefProfile(site, profile) {
  site.briefProfile = profile;
  if (profile.displayName) {
    site.name = profile.displayName;
    site.slug = slugify(profile.displayName) || `portfolio-${site.id}`;
  }
  if (profile.craft) site.craft = profile.craft;
  site.prompt = briefProfilePrompt(profile);
  site.profileText = [
    profile.bio,
    ...profile.experiences.map((item) => `${item.title} — ${item.role} (${item.years}) : ${item.summary}`),
    ...profile.articles.map((item) => `Publication : ${item.title} (${item.publisher}, ${item.year}) ${item.summary} ${item.url}`),
  ]
    .filter(Boolean).join('\n').slice(0, 8000);
  site.stylePreference = profile.visual.preference || profile.visual.references.join(', ');
  const contactEmail = normalizeEmail(profile.contact.email);
  site.email = isValidEmail(contactEmail) ? contactEmail : '';
}

function briefResponse(site) {
  const account = users.get(site.ownerEmail);
  return {
    site: {
      id: site.id,
      name: site.name,
      slug: site.slug,
      status: site.status,
      rebriefing: Boolean(site.rebriefing),
      canRebrief: canStartBrief(site.ownerEmail, users.get(site.ownerEmail)),
      attachments: (site.attachments ?? []).map(({ id, name, width, height }) => ({ id, name, width, height })),
    },
    messages: site.briefMessages ?? [],
    profile: site.briefProfile ?? null,
    summary: site.briefSummary ?? '',
    missing: site.briefMissing ?? ['displayName', 'craft', 'purpose', 'projects', 'visual'],
    ready: Boolean(site.briefReady),
    turn: account?.briefTurnsUsed ?? site.briefTurns ?? 0,
    budgetReached: Boolean(site.briefBudgetReached),
    limits: BRIEF_AGENT_LIMITS,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const m = url.pathname.match(/^\/api\/sites\/([^/]+)(\/(v1|edit|assets|brief))?$/);
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
    const loginPage = (AUTH_MODE === 'magic' ? LOGIN_PAGE : LOGIN_SETUP_PAGE)
      .replaceAll('href="/login"', 'href="/"')
      .replace('<p class="footnote">Le lien expire', '<p class="footnote"><a href="/">← Retour à Folioflash</a></p><p class="footnote">Le lien expire');
    res.end(loginPage);
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
      if (isDisposableEmail(email)) {
        logJob({ kind: 'auth-request', status: 'blocked-disposable', email });
        send(res, 202, { message: 'Si cette adresse peut recevoir un lien, tu le trouveras bientôt dans ta boîte email.' });
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
      res.end(LOGIN_PAGE.replaceAll('href="/login"', 'href="/"').replace('Bienvenue', 'Lien expiré').replace('Ton espace créatif.', 'Demande un nouveau lien pour te connecter.'));
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
      accountFor(email);
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
    res.end(CONVERSATION_TEMPLATE
      .replace('@@BRAND_STYLE@@', BRAND_STYLE)
      .replaceAll('@@EMAIL@@', escapeHtml(currentUser?.email ?? ''))
      .replace('@@LOGOUT_CLASS@@', AUTH_MODE === 'magic' ? '' : 'hidden'));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/conversation.js') {
    res.setHeader('Content-Type', MIME['.js']);
    res.end(readFileSync(path.join(STUDIO_DIR, 'public/conversation.js')));
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
  const assetMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/assets\/([a-f0-9-]{36})$/i);
  if (assetMatch && ['GET', 'DELETE'].includes(req.method)) {
    const site = sites.get(assetMatch[1]);
    const asset = site?.attachments?.find((item) => item.id === assetMatch[2]);
    if (!site || !asset || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'image not found' });
      return;
    }
    const file = path.join(DATA_DIR, 'uploads', site.id, `${asset.id}.webp`);
    if (req.method === 'DELETE') {
      if (site.status === 'live') {
        send(res, 409, { error: 'Supprime les images pendant la préparation du portfolio.' });
        return;
      }
      rmSync(file, { force: true });
      site.attachments = site.attachments.filter((item) => item.id !== asset.id);
      for (const message of site.briefMessages ?? []) {
        message.attachments = (message.attachments ?? []).filter((item) => item.id !== asset.id);
      }
      saveState();
      res.statusCode = 204;
      res.end();
      return;
    }
    if (!existsSync(file)) {
      send(res, 404, { error: 'image not found' });
      return;
    }
    res.setHeader('Content-Type', 'image/webp');
    res.end(readFileSync(file));
    return;
  }
  if (m && m[3] === 'assets' && req.method === 'POST') {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    if (site.status === 'live' && !site.rebriefing) {
      send(res, 409, { error: 'Les images se joignent pendant la préparation du portfolio.' });
      return;
    }
    try {
      const body = await readJson(req, 1_050_000);
      if ((site.attachments ?? []).length >= 8) {
        send(res, 413, { error: 'Tu peux joindre 8 images au maximum.' });
        return;
      }
      const match = String(body.dataUrl ?? '').match(/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) {
        send(res, 400, { error: 'Image invalide. Dépose un JPG, PNG ou WebP pour la convertir.' });
        return;
      }
      const data = Buffer.from(match[1], 'base64');
      if (!data.length || data.length > 700 * 1024) {
        send(res, 413, { error: 'Cette image reste trop volumineuse après optimisation.' });
        return;
      }
      const dimensions = webpDimensions(data);
      if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || Math.max(dimensions.width, dimensions.height) > 680) {
        send(res, 400, { error: 'L’image optimisée n’a pas le bon format ou dépasse 680 px.' });
        return;
      }
      const attachment = {
        id: randomUUID(),
        name: sanitizedFileName(body.name),
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString(),
      };
      const uploadDir = path.join(DATA_DIR, 'uploads', site.id);
      mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
      writeFileSync(path.join(uploadDir, `${attachment.id}.webp`), data, { mode: 0o600, flag: 'wx' });
      site.attachments ??= [];
      site.attachments.push(attachment);
      saveState();
      logJob({ kind: 'brief-image-upload', siteId: site.id, status: 'optimized', bytes: data.length });
      send(res, 201, attachment);
    } catch (error) {
      send(res, 400, { error: error.message });
    }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/sites') {
    const ownedSites = [...sites.values()].filter((site) =>
      AUTH_MODE === 'basic'
        ? !site.ownerEmail || site.ownerEmail === currentUser?.email
        : site.ownerEmail === currentUser?.email && site.legacy !== true,
    );
    send(res, 200, ownedSites.map((site) => ({
      id: site.id,
      slug: site.slug,
      name: site.name,
      status: site.status,
      motif: site.motif,
      legacy: site.legacy !== false,
      credits: credits.get(site.ownerEmail) ?? 0,
      firstGenerationFree: !users.get(site.ownerEmail)?.firstGenerationUsed,
      briefReady: Boolean(site.briefReady),
      briefTurns: site.briefTurns ?? 0,
      rebriefing: Boolean(site.rebriefing),
      canRebrief: canStartBrief(site.ownerEmail, users.get(site.ownerEmail)),
      attachments: (site.attachments ?? []).map(({ id, name, width, height }) => ({ id, name, width, height })),
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
      const hasStructuredBrief = Boolean(name || craft || prompt || profileText || stylePreference);
      if (hasStructuredBrief && (!name || !craft || !prompt)) {
        send(res, 400, { error: 'name, craft and prompt are required' });
        return;
      }
      // One active portfolio per account; imported historical pilots remain archived.
      const ownerEmail = currentUser?.email ?? '';
      if (AUTH_MODE === 'magic') {
        const active = [...sites.values()].find((site) => site.ownerEmail === ownerEmail && site.legacy !== true);
        if (active) {
          send(res, 409, { error: 'Tu as déjà un portfolio. Modifie celui-ci ou supprime-le avant d’en créer un autre.', siteId: active.id });
          return;
        }
      }
      const ownerAccount = accountFor(ownerEmail);
      if (!hasStructuredBrief && (!canStartBrief(ownerEmail, ownerAccount)
        || (ownerAccount?.briefTurnsUsed ?? 0) >= getBriefTurnLimit()
        || (ownerAccount?.briefBudgetUsedEur ?? 0) >= BRIEF_AGENT_LIMITS.maxCostEur)) {
        send(res, 429, { error: 'Le droit de création ou le budget de préparation est déjà utilisé. Recharge ton compte pour continuer.' });
        return;
      }
      const id = `site_${++seq}`;
      const initialName = name || 'Nouveau portfolio';
      const slug = name ? slugify(name) : `portfolio-${id}`;
      const site = {
        id, slug, name: initialName, craft: craft || '', prompt: prompt.slice(0, 5_000), profileText,
        email: publicEmail && isValidEmail(publicEmail) ? publicEmail : '',
        stylePreference,
        ownerEmail,
        legacy: false,
        status: 'draft',
      };
      if (!hasStructuredBrief) {
        site.attachments = [];
        site.briefMessages = [{
          role: 'assistant',
          content: 'Salut ! Raconte-moi ce que tu fais, même en vrac. Tu peux commencer par ton nom ou ton pseudo, coller ton LinkedIn/CV ou dicter.',
        }];
        site.briefProfile = null;
        site.briefTurns = 0;
        site.briefCostEur = 0;
        site.briefReady = false;
        site.briefMissing = ['displayName', 'craft', 'purpose', 'projects', 'visual'];
      }
      sites.set(id, site);
      saveState();
      send(res, 201, { id: site.id, name: site.name, slug: site.slug, status: site.status, credits: credits.get(ownerEmail) ?? 0, firstGenerationFree: !users.get(ownerEmail)?.firstGenerationUsed });
    } catch (err) {
      send(res, 400, { error: err.message });
    }
    return;
  }
  const rebriefMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/brief\/(start|cancel)$/);
  if (rebriefMatch && req.method === 'POST') {
    const site = sites.get(rebriefMatch[1]);
    if (!site || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    const account = accountFor(site.ownerEmail || currentUser?.email || '');
    if (rebriefMatch[2] === 'start') {
      if (site.status !== 'live' || site.rebriefing || site.buildInProgress) {
        send(res, 409, { error: 'La nouvelle préparation ne peut démarrer que depuis un portfolio en ligne.' });
        return;
      }
      if (!canStartBrief(account.email, account)
        || (account.briefTurnsUsed ?? 0) >= getBriefTurnLimit()
        || (account.briefBudgetUsedEur ?? 0) >= BRIEF_AGENT_LIMITS.maxCostEur) {
        send(res, 402, { error: 'Une nouvelle version nécessite des crédits. Ton portfolio actuel reste en ligne.' });
        return;
      }
      const previousFields = [
        'name', 'slug', 'craft', 'prompt', 'profileText', 'email', 'stylePreference',
        'theme', 'motif', 'designDirection', 'projectPresentation', 'attachments',
        'briefProfile', 'briefMessages', 'briefReady', 'briefSummary', 'briefMissing',
        'briefCostEur', 'briefBudgetReached',
      ];
      site.briefPrevious = Object.fromEntries(previousFields.filter((key) => site[key] !== undefined).map((key) => [key, site[key]]));
      site.rebriefing = true;
      site.attachments = [];
      site.briefProfile = null;
      site.briefMessages = [{ role: 'assistant', content: BRIEF_WELCOME }];
      site.briefTurns = account.briefTurnsUsed ?? 0;
      site.briefCostEur = 0;
      site.briefReady = false;
      site.briefBudgetReached = false;
      site.briefMissing = ['displayName', 'craft', 'purpose', 'projects', 'publications', 'visual'];
      saveState();
      send(res, 200, briefResponse(site));
      return;
    }

    if (!site.rebriefing || !site.briefPrevious) {
      send(res, 409, { error: 'Aucune nouvelle préparation n’est en cours.' });
      return;
    }
    const previous = site.briefPrevious;
    const previousAssetIds = new Set((previous.attachments ?? []).map((asset) => asset.id));
    for (const asset of site.attachments ?? []) {
      if (!previousAssetIds.has(asset.id)) rmSync(path.join(DATA_DIR, 'uploads', site.id, `${asset.id}.webp`), { force: true });
    }
    for (const key of ['name', 'slug', 'craft', 'prompt', 'profileText', 'email', 'stylePreference', 'theme', 'motif', 'designDirection', 'projectPresentation', 'attachments', 'briefProfile', 'briefMessages', 'briefReady', 'briefSummary', 'briefMissing', 'briefCostEur', 'briefBudgetReached']) {
      if (Object.hasOwn(previous, key)) site[key] = previous[key];
      else delete site[key];
    }
    delete site.briefPrevious;
    delete site.rebriefing;
    delete site.briefBusy;
    saveState();
    send(res, 200, { id: site.id, name: site.name, slug: site.slug, status: site.status, credits: credits.get(site.ownerEmail) ?? 0 });
    return;
  }

  if (m && m[3] === 'brief' && req.method === 'GET') {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    if (!site.briefMessages) {
      site.briefMessages = [{
        role: 'assistant',
        content: 'Salut ! Raconte-moi ce que tu fais, même en vrac. Tu peux commencer par ton nom ou ton pseudo, coller ton LinkedIn/CV ou dicter.',
      }];
      site.attachments ??= [];
      site.briefTurns ??= 0;
      site.briefCostEur ??= 0;
      site.briefReady ??= false;
      site.briefMissing ??= ['displayName', 'craft', 'purpose', 'projects', 'visual'];
      saveState();
    }
    send(res, 200, briefResponse(site));
    return;
  }
  if (m && m[3] === 'brief' && req.method === 'POST') {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    if ((site.status === 'live' && !site.rebriefing) || site.briefBusy) {
      send(res, 409, { error: 'Cette conversation est déjà en cours ou ton portfolio est en ligne.' });
      return;
    }
    const account = accountFor(site.ownerEmail || currentUser?.email || '');
    if ((account?.briefTurnsUsed ?? 0) >= getBriefTurnLimit()) {
      send(res, 429, { error: 'La préparation a atteint sa limite de questions. Ajoute les derniers détails dans un seul message ou reprends le brief.' });
      return;
    }
    if ((account?.briefBudgetUsedEur ?? 0) >= BRIEF_AGENT_LIMITS.maxCostEur) {
      send(res, 429, { error: 'Le budget de préparation est atteint. Aucun nouvel appel IA ne sera lancé.' });
      return;
    }
    let attemptedTurn = (account?.briefTurnsUsed ?? 0) + 1;
    try {
      const body = await readJson(req);
      const message = String(body.message ?? '').trim().slice(0, 4000);
      const requestedIds = [...new Set(Array.isArray(body.assetIds) ? body.assetIds.map(String) : [])].slice(0, 8);
      const attachments = (site.attachments ?? []).filter((asset) => requestedIds.includes(asset.id));
      if (!message && attachments.length === 0) {
        send(res, 400, { error: 'Écris un message ou joins au moins une image.' });
        return;
      }
      if (requestedIds.length !== attachments.length) {
        send(res, 400, { error: 'Une image jointe n’est plus disponible. Retire-la puis réessaie.' });
        return;
      }
      site.attachments ??= [];
      site.briefMessages ??= [];
      site.briefCostEur ??= 0;
      site.briefBusy = true;
      site.briefReady = false;
      site.briefBudgetReached = false;
      account.briefTurnsUsed = (account.briefTurnsUsed ?? 0) + 1;
      site.briefTurns = account.briefTurnsUsed;
      attemptedTurn = site.briefTurns;
      site.briefMessages.push({
        role: 'user',
        content: message || 'Voici des images pour mon portfolio.',
        attachments: attachments.map(({ id, name }) => ({ id, name })),
      });
      saveState();

      const agentImages = attachments.map((asset) => ({
        ...asset,
        data: readFileSync(path.join(DATA_DIR, 'uploads', site.id, `${asset.id}.webp`)),
      }));
      const result = await advanceBrief({
        messages: site.briefMessages,
        previousProfile: site.briefProfile ?? {},
        attachments: agentImages,
        turnNumber: site.briefTurns,
        spentEur: account.briefBudgetUsedEur ?? 0,
      });
      if (!site.rebriefing) applyBriefProfile(site, result.profile);
      site.briefProfile = result.profile;
      site.briefReady = result.ready;
      site.briefMissing = result.missing;
      site.briefSummary = result.summary;
      site.briefCostEur += result.costEur;
      account.briefBudgetUsedEur = Number(account.briefBudgetUsedEur ?? 0) + result.budgetEur;
      site.briefBudgetReached = Boolean(result.budgetReached);
      site.briefBusy = false;
      site.briefMessages.push({ role: 'assistant', content: result.reply });
      saveState();
      logJob({
        kind: 'brief-turn',
        siteId: site.id,
        status: result.ready ? 'ready' : 'needs-info',
        turn: site.briefTurns,
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costEur: result.costEur,
        budgetEur: result.budgetEur,
      });
      send(res, 200, briefResponse(site));
    } catch (error) {
      site.briefBusy = false;
      if (error.partialBudgetEur) {
        account.briefBudgetUsedEur = Number(account.briefBudgetUsedEur ?? 0) + error.partialBudgetEur;
        site.briefCostEur = Number(site.briefCostEur ?? 0) + Number(error.partialCostEur ?? 0);
      }
      account.briefTurnsUsed = Math.max(0, (account.briefTurnsUsed ?? 1) - 1);
      site.briefTurns = account.briefTurnsUsed;
      site.briefMessages?.pop();
      saveState();
      logJob({
        kind: 'brief-turn',
        siteId: site.id,
        status: 'failed',
        turn: attemptedTurn,
        error: error.message === 'brief_cost_limit' ? 'budget-limit' : 'provider-error',
        costEur: Number(error.partialCostEur ?? 0),
        budgetEur: Number(error.partialBudgetEur ?? 0),
      });
      const code = error.message === 'brief_cost_limit' ? 429 : 502;
      send(res, code, { error: code === 429
        ? 'Le budget de préparation est atteint. Aucun autre appel IA n’a été lancé.'
        : 'Je n’arrive pas à analyser ce message pour le moment. Réessaie sans perdre ton brief.' });
    }
    return;
  }
  if (m && req.method === 'GET' && !m[3]) {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    send(res, 200, { ...site, credits: credits.get(site.ownerEmail) ?? 0, firstGenerationFree: !users.get(site.ownerEmail)?.firstGenerationUsed });
    return;
  }
  if (m && req.method === 'DELETE' && !m[3]) {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    sites.delete(m[1]);
    rmSync(path.join(DATA_DIR, 'uploads', site.id), { recursive: true, force: true });
    if (site.distDir) rmSync(path.resolve(STUDIO_DIR, site.distDir, '..'), { recursive: true, force: true });
    lastLiveDir = null;
    for (const candidate of [...sites.values()].reverse()) {
      if (candidate.status === 'live' && candidate.distDir) {
        const dir = path.resolve(STUDIO_DIR, candidate.distDir);
        if (existsSync(dir)) {
          lastLiveDir = dir;
          break;
        }
      }
    }
    saveState();
    logJob({ kind: 'delete-site', siteId: m[1], slug: site.slug });
    res.statusCode = 204;
    res.end();
    return;
  }
  if (m && req.method === 'POST' && (m[3] === 'v1' || m[3] === 'edit')) {
    const site = sites.get(m[1]);
    if (!site || (AUTH_MODE === 'magic' && (site.ownerEmail !== currentUser?.email || site.legacy === true))) {
      send(res, 404, { error: 'unknown site' });
      return;
    }
    const kind = m[3];
    if (kind === 'v1' && site.briefMessages && !site.briefReady) {
      send(res, 409, { error: 'Termine le brief et relis son résumé avant de créer ton portfolio.' });
      return;
    }
    const accountEmail = site.ownerEmail || currentUser?.email || '';
    const account = accountFor(accountEmail);
    if (site.status === 'building' || site.buildInProgress) {
      send(res, 409, { error: 'Une génération est déjà en cours pour ce portfolio.' });
      return;
    }
    const internalTestFreeGeneration = kind === 'v1'
      && site.rebriefing
      && BRIEF_TEST_FREE_EMAILS.includes(accountEmail)
      && !account?.briefTestFreeUsed;
    const freeFirstGeneration = kind === 'v1' && (!account?.firstGenerationUsed || internalTestFreeGeneration);
    const requiresCredit = !freeFirstGeneration;
    let retiredBuildDir = null;
    let retiredAssetPaths = [];
    try {
      const body = kind === 'edit' ? await readJson(req) : {};
      const editPrompt = kind === 'edit' ? String(body.prompt ?? '').trim() : '';
      const generationProfile = site.rebriefing && site.briefProfile ? { ...site } : site;
      if (generationProfile !== site) {
        applyBriefProfile(generationProfile, site.briefProfile);
        generationProfile.slug = uniquePortfolioSlug(generationProfile.name, site.id, site.id);
      }
      const basePrompt = generationProfile.briefProfile
        ? `Brief conversationnel confirmé :\n${generationProfile.prompt}\n\nBiographie et expériences confirmées :\n${generationProfile.profileText}`
        : generationProfile.profileText
          ? `Profil fourni :\n${generationProfile.profileText}\n\nBrief :\n${generationProfile.prompt}`
          : generationProfile.prompt;
      const prompt = kind === 'edit'
        ? `${basePrompt}\n\nRequested update: ${editPrompt}`
        : basePrompt;
      if (!prompt || (kind === 'edit' && !editPrompt)) {
        send(res, 400, { error: 'prompt is required' });
        return;
      }
      if (requiresCredit) {
        const balance = credits.get(accountEmail) ?? 0;
        if (balance < 1) {
          const message = account?.firstGenerationUsed
            ? 'Tu as déjà utilisé ta génération offerte. Il te faut des crédits pour continuer ; la recharge sera bientôt disponible.'
            : 'La première génération est offerte. Les modifications suivantes nécessitent des crédits ; la recharge sera bientôt disponible.';
          send(res, 402, { error: message });
          return;
        }
        credits.set(accountEmail, balance - 1);
      }
      site.buildInProgress = true;
      if (!(site.status === 'live' && site.rebriefing && site.distDir)) site.status = 'building';
      saveState();
      const profileForBuild = generationProfile;
      const selectedAssetIds = new Set((profileForBuild.briefProfile?.projects ?? []).flatMap((project) => project.assetIds ?? []));
      const assets = (site.attachments ?? [])
        .filter((asset) => selectedAssetIds.has(asset.id))
        .map((asset) => ({
          ...asset,
          data: readFileSync(path.join(DATA_DIR, 'uploads', site.id, `${asset.id}.webp`)),
        }));
      const result = await runJob({
        slug: profileForBuild.slug,
        kind,
        profile: profileForBuild,
        assets,
        prompt: kind === 'edit'
          ? `${site.prompt}\n\nRequested update: ${prompt}`
          : prompt,
      });
      if (site.rebriefing && generationProfile !== site) {
        const oldBuildDir = site.distDir ? path.resolve(STUDIO_DIR, site.distDir, '..') : null;
        if (oldBuildDir && oldBuildDir !== path.resolve(STUDIO_DIR, result.distDir, '..')) retiredBuildDir = oldBuildDir;
        for (const key of ['name', 'slug', 'craft', 'prompt', 'profileText', 'email', 'stylePreference']) {
          site[key] = generationProfile[key];
        }
        retiredAssetPaths = (site.briefPrevious?.attachments ?? []).map((asset) => path.join(DATA_DIR, 'uploads', site.id, `${asset.id}.webp`));
        delete site.briefPrevious;
        delete site.rebriefing;
      }
      site.status = result.status;
      site.distDir = result.distDir;
      site.theme = result.theme ?? site.theme;
      site.motif = result.motif ?? site.motif ?? 'cercles';
      site.projectPresentation = result.projectPresentation ?? site.projectPresentation ?? 'editorial';
      site.designDirection = result.designDirection;
      site.buildInProgress = false;
      if (freeFirstGeneration && account) account.firstGenerationUsed = true;
      if (internalTestFreeGeneration && account) account.briefTestFreeUsed = true;
      if (result.absDistDir) lastLiveDir = result.absDistDir;
      saveState();
      logJob({ kind: `${kind}-request`, siteId: m[1], slug: site.slug, ...result.usage });
      for (const file of retiredAssetPaths) {
        try { rmSync(file, { force: true }); } catch { /* keep the new published version available */ }
      }
      if (retiredBuildDir) {
        try { rmSync(retiredBuildDir, { recursive: true, force: true }); } catch { /* keep the new published version available */ }
      }
      send(res, 200, {
        id: site.id,
        slug: site.slug,
        name: site.name,
        status: site.status,
        motif: site.motif,
        theme: site.theme,
        designDirection: site.designDirection,
        credits: credits.get(accountEmail) ?? 0,
        canRebrief: canStartBrief(accountEmail, account),
        usage: result.usage,
      });
    } catch (err) {
      const keepCurrentLiveSite = site.status === 'live' && site.distDir;
      site.buildInProgress = false;
      if (!keepCurrentLiveSite) site.status = 'failed';
      if (requiresCredit) credits.set(accountEmail, (credits.get(accountEmail) ?? 0) + 1);
      saveState();
      logJob({ kind: `${kind}-request`, siteId: m[1], status: 'failed', error: err.message });
      send(res, 500, { error: err.message, credits: credits.get(accountEmail) ?? 0 });
    }
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`folioflash-studio listening on :${PORT}`));
