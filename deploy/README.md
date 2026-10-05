# Deploy Folioflash Studio on the nano

Target: `https://folioflash.camilleaubert.com` → `folioflash-studio:4322` (NPM + Let's Encrypt).

## 0. DNS (Camille, Cloudflare UI, 2 min)

`CNAME folioflash → camilleaubert.com` (proxied). Without it, no HTTPS cert.

## 1. First install (from the workspace)

Create `deploy/.env` on the nano (never commit it), with `LLM_PROVIDER`,
`LLM_MODEL`, and `LLM_API_KEY`. The Studio supports OpenRouter and records
provider-reported token/cost usage. Current personal pilot uses the configured
OpenRouter model; use a dedicated Folioflash key for production/beta.

Magic-link activation requires email provider credentials (Brevo SMTP/API or Resend) and a verified
sender identity. Configure `EMAIL_PROVIDER=brevo-smtp`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURITY`, `SMTP_LOGIN`, `SMTP_PASS` (or the corresponding API-key variables),
`MAIL_FROM`, a random `SESSION_SECRET` (32+ chars), `PUBLIC_BASE_URL`, and a pilot
`MAGIC_ALLOWED_EMAILS` list; verify login,
logout and link expiry before changing `AUTH_MODE=basic` to `AUTH_MODE=magic`. Do not
enable public signup or disable Basic Auth before that smoke test and the Stripe wallet.

```bash
cd /var/www/html/sideprojects/folioflash
ssh -F /tmp/ssh-ff/config nano 'mkdir -p /home/ubuntu/apps/folioflash'
rsync -avz -e 'ssh -F /tmp/ssh-ff/config' --exclude node_modules --exclude .git ./ nano:/home/ubuntu/apps/folioflash/
ssh -F /tmp/ssh-ff/config nano 'cd /home/ubuntu/apps/folioflash/deploy && docker compose up -d --build'
```

## 2. NPM proxy host (Camille, NPM UI via SSH tunnel)

New Proxy Host: `folioflash.camilleaubert.com` → `folioflash-studio:4322`,
Block Common Exploits ON, SSL Let's Encrypt (force SSL). Container must be on
`travel-network` (it is — same backbone as portfolio/nestor, name is historical).

### Automated variant (NPM API, done 2026-10-05 — host id 4, cert id 6)

```bash
ssh -F /tmp/ssh-ff/config -L 8282:127.0.0.1:81 -N nano   # tunnel (background)
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
ssh -F /tmp/ssh-ff/config nano 'docker ps --format "{{.Names}} {{.Status}}" | grep folio'
curl -s http://localhost:4322/api/health            # via SSH, before DNS
curl -s https://folioflash.camilleaubert.com/api/health  # after DNS + NPM
```

## Updates (never --delete)

```bash
rsync -avz -e 'ssh -F /tmp/ssh-ff/config' --exclude node_modules --exclude .git ./ nano:/home/ubuntu/apps/folioflash/
ssh -F /tmp/ssh-ff/config nano 'cd /home/ubuntu/apps/folioflash/deploy && docker compose up -d --build'
```

`folio-data` volume persists `studio/data/` (builds + jobs log) across rebuilds.
