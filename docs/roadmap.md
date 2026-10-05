# Folioflash — Roadmap

## M0 — Cadrage (cette semaine)
- [x] CDC v1 + architecture + coûts + marketing (ce repo)
- [ ] Valider prix (29 € / crédits / renouvellement) + créer compte Stripe test
- [ ] Réserver domaine vitrine + créer orga GitHub dédiée (pas le compte perso à terme)
- [ ] Lister 8-12 potes pilotes gratuits

## M1 — Studio + Pages live (en cours)
- [x] Template-folio dérivé d'earlyreflect (Astro 6, 1 collection générique, 3 palettes, FR/EN, `llms.txt`, `deploy.yml` Pages)
- [x] Pipeline V1 réel : `POST /api/sites/:id/v1` → génération (LLM si clé, sinon fallback) → build Astro → `live` (vérifié : 6 pages, palette client)
- [x] Régénération au prompt (texte + dictée voix Web Speech API FR/EN) : `POST /api/sites/:id/edit` → rebuild immédiat, 1 crédit, tokens/coût loggés
- [ ] Auth lien magique + Stripe test (29 € publication, crédits ~2 €) + push repo client → Pages
- [x] Paquet déploiement nano (Dockerfile node:22 + compose sur `travel-network` + runbook `deploy/`) — reste : DNS Cloudflare + Proxy Host NPM
- [ ] Template-folio dérivé d'earlyreflect + `optimize-image` + `llms.txt`
- [ ] Pipeline live-only (repo/orga → Actions → Pages) + CNAME auto
- [ ] Stripe Checkout publication + crédits + webhooks + factures
- [ ] 10 sites pilotes (dont potes gratuits) + mesure Lighthouse + coûts réels

## M2 — Industrialisation
- [ ] 3 templates, rollback UI, OAuth GitHub/Google, quotas anti-abus
- [ ] Robot LinkedIn + blog régulier
- [ ] Phase B : sortie GitHub → build Docker sur serveur (NPM/Cloudflare), si limites Pages

## M3 — Scale
- [ ] ES/DE/IT, marketplace de templates, API/affiliation, support DNS assisté
