# Folioflash — Architecture (reprise earlyreflect)

## 1. Ce qu'on réutilise tel quel

`sideprojects/earlyreflect/` est le gabarit prouvé :

- **Astro 6 + Tailwind 4 + TS**, 100 % statique, `npm run build → dist/`.
- **`config-domain.mjs`** : `SITE_URL` + `BASE_PATH` — le seul fichier à changer pour brancher un domaine.
- **`.github/workflows/deploy.yml`** : push `main` → `npm ci` → `npm run build` → `deploy-pages@v4`. Concurrency `pages`, `cancel-in-progress: true`.
- **Contenu en collections Markdown bilingues** `src/content/projects/{en,fr}/{slug}.md` + `src/data/site.ts` + `src/data/pages.ts` + `src/i18n/ui.ts`.
- **Images** : `scripts/optimize-image.mjs` (brut → WebP responsive) + composants `WpImage`, façades `LiteYouTube/LiteVimeo/SoundCloudFacade` (iframe au clic), `AudioPlayer` natif.
- **Discoverability IA** : `llms.txt`, `llms-full.txt`, `persona.json` générés depuis le contenu, crawlers IA autorisés.
- **i18n** : EN à la racine, FR sous `/fr/`, `prefixDefaultLocale: false`.
- **Coût** : 0 € hosting (GitHub Pages) + HTTPS Let's Encrypt.

## 2. Template Folioflash V1 (1 seul en M1)

Dérivé d'earlyreflect, simplifié :

```
template-folio/
├── config-domain.mjs        # par client
├── src/content/projects/{en,fr}/  # 0-6 projets générés par l'IA
├── src/data/site.json       # profil : nom, métier, bio, socials, email
├── src/pages/               # home, work, about, contact (FR/EN)
├── src/styles/global.css    # 3 palettes au choix (tokens CSS)
└── scripts/                 # optimize-image, audit, gen-og, gen-llms
```

L'IA ne génère **que** : `site.json`, fiches projets MD, palette choisie, assets optimisés. Jamais de code arbitraire en M1 (garde-fou coût + sécu).

## 3. Pipeline live-only M1 (Phase A — GitHub)

```
Studio (nano) → crée repo client (orga Folioflash)
  → IA commit (contenu + assets WebP)
  → push main → GitHub Actions build → Pages live
  → CNAME si domaine custom
```

- Pas d'environnement preview en M1 (assumé, cf. CDC §3.3).
- Chaque job = 1 commit traçable → rollback = revert (M2 exposé en UI).
- Quotas : 1 site/user en gratuit, builds sérialisés par repo (concurrency pages).

Limites connues : orga GitHub perso à terme à éviter → créer une **orga dédiée** dès ~20 sites ; au-delà, Phase B.

## 4. Phase B (M2+) — sortie GitHub vers nano/serveur

Même image que `camilleaubert-infra` :

- Build Docker (Node builder → Nginx Alpine), reverse proxy **NPM** + **Cloudflare** DNS.
- Le Studio pousse le `dist/` (ou le repo) sur le serveur, `docker compose up -d --build` par site ou mutualisé par vhost.
- Avantage : pas de limite Pages, domaines illimités, logs/headers maîtrisés. Coût : ~nano actuel puis instance dédiée (voir `couts.md`).

## 5. Studio sur nano (M1 minimal)

- Node 22 + SQLite (1 DB) + stockage fichiers local (quota/user).
- Rôles : auth lien magique, CRUD sites, file d'jobs IA (1 worker, timeout 5 min), webhooks Stripe, création repo via token, vérif DNS (dig/CNAME), logs par job.
- Preuve de coût : le nano actuel (t3.nano 2 vCPU / ~0.5 Go RAM) **ne build pas** ; il orchestre seulement — les builds tournent sur GitHub Actions en Phase A. Aucun MySQL/Laravel sur nano.
- Secrets : `.secrets.env` local + variables d'env serveur, jamais commité (`.gitignore` déjà en place).

## 6. Ce qu'on ne fait pas en M1

Multi-templates, preview par PR, édition visuelle drag&drop, OAuth social complet, analytics embarqué, langues au-delà de FR/EN.
