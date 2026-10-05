# Folioflash — générateur de portfolio ultra-rapide

> Statut : cadrage (M0). Repo produit indépendant. Hébergement Day 1 : nano, puis migration dédiée.

Folioflash permet à n'importe qui de générer un portfolio statique **Astro** léger, en 5 minutes :
prompt + assets → **V1 gratuite limitée** → si ça plaît, paiement **Stripe** → site live + domaine custom → itérations facturées au token.

## Docs

- `docs/cahier-des-charges.md` — spec complète (vision, parcours, fonctionnel, critères d'acceptation)
- `docs/architecture.md` — reprise du pattern `earlyreflect` (Astro + GitHub Pages + Actions, live-only)
- `docs/couts.md` — évaluation des coûts (infra, Stripe, LLM, domaines)
- `docs/marketing-seo.md` — nom, design, exemples, blog, robot LinkedIn
- `docs/roadmap.md` — jalons M0 → M3

## Pattern source

- `../earlyreflect/` — Astro 6 + Tailwind 4 + GitHub Pages + Actions (push main → live, `config-domain.mjs`, façades vidéo, `llms.txt`)
- `../camilleaubert.com/` + `../camilleaubert-infra/` — variante Docker/NPM sur serveur (cible post-GitHub)

## Démarrage (M0)

```bash
cat docs/cahier-des-charges.md
cat docs/couts.md
```

Pas de code exécutable en M0 — que du cadrage versionné.
