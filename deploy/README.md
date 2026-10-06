# Deploy Folioflash Studio on the nano

Target: `https://folioflash.camilleaubert.com` → `folioflash-studio:4322` (NPM + Let's Encrypt).

## 0. DNS (Camille, Cloudflare UI, 2 min)

`CNAME folioflash → camilleaubert.com` (proxied). Without it, no HTTPS cert.

## 1. First install (from the workspace)

Create `deploy/.env` on the nano (never commit it), with `LLM_PROVIDER`,
`LLM_MODEL`, and `LLM_API_KEY`. The Studio supports OpenRouter and records
provider-reported token/cost usage. Current personal pilot uses the configured
OpenRouter model; use a dedicated Folioflash key for production/beta.

Magic-link authentication requires email provider credentials (Brevo SMTP/API or Resend) and a verified
sender identity. Configure `AUTH_MODE=magic`, `EMAIL_PROVIDER=brevo-smtp`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURITY`, `SMTP_LOGIN`, `SMTP_PASS` (or the corresponding API-key variables),
`MAIL_FROM`, a random `SESSION_SECRET` (32+ chars), `PUBLIC_BASE_URL`, and a pilot
`MAGIC_ALLOWED_EMAILS` list. Smoke-test login, logout and link expiry before opening signup.
Camille confirmed receipt and successful login on 2026-10-06; Basic Auth is already inactive
on the nano (`GET /studio` redirects unauthenticated visitors to `/login`). Keep
`PUBLIC_SIGNUP_ENABLED=false` until pilot onboarding is ready.
`BRIEF_TEST_FREE_EMAILS` is an optional, internal-only allowlist for one rebrief of an
already-live operator portfolio; it is configured for the existing QA account only,
not the general pilot allowlist. It is consumed only after a successful replacement build.
Node's built-in SQLite runtime needs Node 22.19+ and the `--experimental-sqlite` flag (already
set by the Docker command). Existing `state.json`/`jobs.jsonl` are imported once; retain them
until the SQLite backup/restore smoke test passes.

Deployment commands assume the SSH alias `camille-prod` is configured locally; never put a private key or the remote `.env` in Git.

```bash
cd /var/www/html/sideprojects/folioflash
tar -czf - --exclude='./.git' --exclude='./.env' --exclude='./deploy/.env' \
  --exclude='./studio/data' --exclude='*/node_modules' . \
  | ssh camille-prod 'mkdir -p /home/ubuntu/apps/folioflash && tar -xzf - -C /home/ubuntu/apps/folioflash'
ssh camille-prod 'cd /home/ubuntu/apps/folioflash/deploy && docker compose up -d --build'
```

## 2. NPM proxy host (Camille, NPM UI via SSH tunnel)

New Proxy Host: `folioflash.camilleaubert.com` → `folioflash-studio:4322`,
Block Common Exploits ON, SSL Let's Encrypt (force SSL). Container must be on
`travel-network` (it is — same backbone as portfolio/nestor, name is historical).

### Automated variant (NPM API, done 2026-10-05 — host id 4, cert id 6)

```bash
ssh -L 8282:127.0.0.1:81 -N camille-prod   # tunnel (background)
TOKEN=$(curl -s http://localhost:8282/api/tokens \
  -H 'Content-Type: application/json' \
  -d '{"identity":"aubertcam@gmail.com","secret":"..."}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
# HTTP host first (cert fields are rejected on create)
curl -s -X POST http://localhost:8282/api/nginx/proxy-hosts \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"domain_names":["folioflash.camilleaubert.com"],"forward_scheme":"http","forward_host":"folioflash-studio","forward_port":4322}'
# LE cert: payload MINIMAL — email comes from the account, meta = {dns_challenge:false} only
curl -s -X POST http://localhost:8282/api/nginx/certificates \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"provider":"letsencrypt","nice_name":"folioflash","domain_names":["folioflash.camilleaubert.com"],"meta":{"dns_challenge":false}}'
# Attach: PUT /api/nginx/proxy-hosts/4 {"certificate_id":6,"ssl_forced":true,"http2_support":true,"block_exploits":true}
```

NPM admin password was reset via DB on 2026-10-05
(`auth.secret` for user 1, backup `database.sqlite.bak-folio`) — Camille: change it in the UI.

## 3. Validate

```bash
ssh camille-prod 'docker ps --format "{{.Names}} {{.Status}}" | grep folio'
curl -s http://localhost:4322/api/health            # via SSH, before DNS
curl -s https://folioflash.camilleaubert.com/api/health  # after DNS + NPM
```

## 4. Current production state (2026-10-06)

- Studio runs Node 22.19, `AUTH_MODE=magic`; public signup is still closed.
- Release `1a2f28e` is live. An internal one-time rebrief allowance is configured
  only for the current Magic Link account (runtime `.env`, not Git). The user can
  click **« Préparer une nouvelle version »** from the live portfolio; the current
  build stays public until the replacement succeeds or the user cancels.
- The previous published site remains the fallback during generation. The new
  public slug receives a `persona.json`, `ProfilePage`/`Person` JSON-LD, canonical,
  `robots.txt` and sitemap including the persona. Google crawl timing is not
  guaranteed; Search Console submission remains pending for each client domain.
- Before this release, online SQLite/build backups were stored at
  `/home/ubuntu/backups/folioflash/2026-10-06-pre-rebrief-v2/`; the runtime env
  backup is `/home/ubuntu/backups/folioflash/deploy-env-before-internal-rebrief-2026-10-06.env`.
- Folioflash Stripe is **not** enabled. The OpenRouter key balance is provider
  spend, not the client's Folioflash credit wallet.

## Updates (never --delete)

```bash
tar -czf - --exclude='./.git' --exclude='./.env' --exclude='./deploy/.env' \
  --exclude='./studio/data' --exclude='*/node_modules' . \
  | ssh camille-prod 'tar -xzf - -C /home/ubuntu/apps/folioflash'
ssh camille-prod 'cd /home/ubuntu/apps/folioflash/deploy && docker compose up -d --build'
```

`folio-data` volume persists `studio/data/` (builds + jobs log) across rebuilds.

## 5. SQLite snapshot/rollback

Before changing the database schema or a live portfolio, make an online SQLite
backup and preserve the current site builds. Keep the output private (`chmod 600`);
the database contains account/profile data.

```bash
ssh camille-prod 'docker exec folioflash-studio node --experimental-sqlite --input-type=module -e '\''import {DatabaseSync, backup} from "node:sqlite"; const db=new DatabaseSync("/app/studio/data/folioflash.sqlite"); await backup(db,"/tmp/folioflash.sqlite.bak"); db.close();'\'''
ssh camille-prod 'docker exec folioflash-studio sh -c '\''set -- state.json jobs.jsonl builds; [ ! -d /app/studio/data/uploads ] || set -- "$@" uploads; tar -czf /tmp/folio-data.tar.gz -C /app/studio/data "$@"'\'''
ssh camille-prod 'mkdir -p /home/ubuntu/backups/folioflash/<dated-change> && docker cp folioflash-studio:/tmp/folioflash.sqlite.bak /home/ubuntu/backups/folioflash/<dated-change>/folioflash.sqlite && docker cp folioflash-studio:/tmp/folio-data.tar.gz /home/ubuntu/backups/folioflash/<dated-change>/data-and-builds.tar.gz && chmod 600 /home/ubuntu/backups/folioflash/<dated-change>/* && sha256sum /home/ubuntu/backups/folioflash/<dated-change>/*'
```

Replace `<dated-change>` in the final command with a unique directory name (for
example `2026-10-06-before-change`). **Do not restore over a running database.**
Restore the database and matching build archive together during a controlled
rollback; verify on a separate copy first. Snapshots already made:

- `/home/ubuntu/backups/folioflash/pre-sqlite-2026-10-06-01.tar.gz`
- `/home/ubuntu/backups/folioflash/2026-10-06-pre-brief/`
- `/home/ubuntu/backups/folioflash/2026-10-06-pre-rebrief-v2/`
