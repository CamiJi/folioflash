# Studio — run + API contract (M1)

```bash
nvm use 22            # Nano: Node ≥ 22 requis (build Astro)
node server.mjs       # → http://localhost:4322 (form + JSON API, zero deps)
```

Env: `PORT`, `TEMPLATE_DIR` (défaut `../template-folio`), `NODE_BIN` (défaut `node`),
`LLM_PROVIDER=anthropic|openai|openrouter`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_PRICE_IN/OUT` (€/1M tokens).
Sans clé LLM : fallback local déterministe (marqué `local-fallback`, coût 0) — le pipeline reste testable.
Avec OpenRouter configuré, les erreurs API/JSON sont renvoyées (pas de fallback silencieux) et
la tentative échouée rembourse le crédit. Sites/crédits sont persistés dans `data/state.json`.
`STUDIO_USER` + `STUDIO_PASSWORD` protègent `/` et les routes `/api/*` en HTTP Basic Auth
(la route publique `/demo/` reste ouverte). Obligatoires sur le nano avant d'activer une clé LLM.

| Method | Route | Effet |
|---|---|---|
| GET | `/` | formulaire (prompt texte **+ dictée voix** Web Speech API FR/EN) |
| GET | `/api/health` | `{ ok, sites }` |
| POST | `/api/sites` | crée le site (`draft`, **3 crédits test**) |
| POST | `/api/sites/:id/v1` | job V1 **gratuit** : génère → build Astro → `live`, log tokens/coût |
| POST | `/api/sites/:id/edit` | `{ prompt }` → **1 crédit**, rebuild + redéploiement immédiat |
| GET | `/api/sites/:id` | site + crédits |

| Method | Route | Body → Response |
|---|---|---|
| GET | `/` | intake form (HTML) |
| GET | `/api/health` | `{ ok, sites }` |
| GET | `/api/sites` | list (in-memory) |
| POST | `/api/sites` | `{ name, craft, prompt, palette }` → `201 { id, slug, status: 'queued', costEstEur }` |

Every POST appends to `data/jobs.jsonl` (git-ignored) — the raw material for `docs/couts.md §5` cost measurement.

## Next (M1 order)

1. Magic-link auth (email) + `users` table (`schema.sql` ready).
2. Real V1 job: prompt → `site.json` + project `.md` + optimized images → commit to client repo (org `Folioflash-*`) → Pages live.
3. Stripe test: Checkout publication 29 € + credits ~2 € + webhooks → `credits` update.
4. DNS check endpoint (`GET /api/sites/:id/dns`) before custom-domain go-live.
