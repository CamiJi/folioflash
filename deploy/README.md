# Deploy Folioflash Studio on the nano

Target: `https://folioflash.camilleaubert.com` → `folioflash-studio:4322` (NPM + Let's Encrypt).

## 0. DNS (Camille, Cloudflare UI, 2 min)

`CNAME folioflash → camilleaubert.com` (proxied). Without it, no HTTPS cert.

## 1. First install (from the workspace)

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
