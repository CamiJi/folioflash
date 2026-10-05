# Folioflash — Roadmap

## M0 — Cadrage (cette semaine)
- [x] CDC v1 + architecture + coûts + marketing (ce repo)
- [ ] Valider prix (29 € / crédits / renouvellement) + créer compte Stripe test
- [ ] Réserver domaine vitrine + créer orga GitHub dédiée (pas le compte perso à terme)
- [ ] Lister 8-12 potes pilotes gratuits

## M1 — Studio + Pages live (en cours)
- [x] Template-folio dérivé d'earlyreflect (Astro 6, 1 collection générique, 3 palettes, FR/EN, `llms.txt`, `deploy.yml` Pages)
- [x] Pipeline V1 réel OpenRouter : prompt → contenu FR/EN + projets → build Astro live (test Léa : 3 projets correctement extraits, coût ~0,004 €)
- [x] Régénération au prompt (texte + dictée voix Web Speech API FR/EN) : `POST /api/sites/:id/edit` → rebuild immédiat, 1 crédit, coût tokens loggé
- [ ] Auth lien magique + Stripe test (29 € publication, crédits ~2 €) + push repo client → Pages
- [x] Studio déployé sur `https://folioflash.camilleaubert.com` (nano, Basic Auth provisoire sur Studio/API, démo publique `/demo/`)
- [x] Paquet déploiement nano (Dockerfile Node 22 + compose sur `travel-network` + runbook `deploy/`)
- [ ] Push vers repo client → GitHub Actions/Pages + CNAME auto (pour l'instant seul `/demo/` est public)
- [ ] Stripe Checkout publication + crédits + webhooks + factures
- [ ] 10 sites pilotes (dont potes gratuits) + mesure Lighthouse + coûts réels

## M2 — Industrialisation
- [ ] 3 templates, rollback UI, OAuth GitHub/Google, quotas anti-abus
- [ ] Robot LinkedIn + blog régulier
- [ ] Phase B : sortie GitHub → build Docker sur serveur (NPM/Cloudflare), si limites Pages

## M3 — Scale
- [ ] ES/DE/IT, marketplace de templates, API/affiliation, support DNS assisté
