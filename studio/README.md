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
| POST | `/api/sites` | crée le site (`draft`, **3 crédits de test locaux**) |
| POST | `/api/sites/:id/v1` | job V1 **gratuit** : génère → build Astro → `live`, log tokens/coût |
| POST | `/api/sites/:id/edit` | `{ prompt }` → **1 crédit**, rebuild + redéploiement immédiat |
| GET | `/api/sites/:id` | site + crédits |

| Method | Route | Body → Response |
| GET | `/demo/` | latest generated demo (public; **not** a customer domain) |

`data/state.json` persists pilot site state; `data/jobs.jsonl` records jobs/costs.
The current test credit map is not a payment ledger and must be replaced before launch.

## Not production-ready yet

- Basic Auth is only a temporary gate; real customer accounts/authentication remain to build.
- Upload UI and server-side asset optimization are not implemented yet.
- No Stripe, DNS/domain onboarding, multi-site host routing or automated certificate provisioning yet.
- No customer receives or delegates a Folioflash subdomain. They will connect their own domain.

## Next (M1 order)

1. Rebrand landing + Studio with Folioflash/Nestor product tokens.
2. Real account auth and durable SQLite records for users, domains, builds and billing.
3. Upload validation/optimization (WebP, responsive sizes, EXIF removal; discard originals).
4. Multi-site static hosting on the personal server and automated DNS/TLS onboarding for customer-owned domains.
5. Stripe test-mode payment flow, cost estimates, idempotent webhooks and billing ledger.
6. Pilot capacity, backups, restoration and cost/load tests before inviting more users.
