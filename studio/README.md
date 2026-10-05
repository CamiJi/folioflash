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
En production, `AUTH_MODE=basic` garde le verrou opérateur provisoire. Le mode `magic`
demande `RESEND_API_KEY`, un expéditeur `MAIL_FROM` vérifié, `PUBLIC_BASE_URL` HTTPS et
`SESSION_SECRET` aléatoire d'au moins 32 caractères. Tant que Resend n'est pas configuré,
le code reste en mode Basic ; la route publique `/demo/` reste ouverte.

| Method | Route | Effet |
|---|---|---|
| GET | `/` | Studio Folioflash (Basic Auth provisoire ou session compte) |
| GET | `/login` | connexion par email en mode magic ; écran de statut tant que mode Basic |
| POST | `/api/auth/request` | demande de lien (pas de réponse indiquant si un compte existe) |
| GET/POST | `/auth/verify` | page de confirmation puis échange du lien à usage unique contre session |
| POST | `/api/auth/logout` | révoque la session |
| GET | `/api/health` | `{ ok }` |
| POST | `/api/sites` | crée le site (`draft`, **3 crédits de test locaux**) |
| POST | `/api/sites/:id/v1` | job V1 **gratuit** : génère → build Astro → `live`, log tokens/coût |
| POST | `/api/sites/:id/edit` | `{ prompt }` → **1 crédit**, rebuild + redéploiement immédiat |
| GET | `/api/sites/:id` | site + crédits |

| Method | Route | Body → Response |
| GET | `/demo/` | latest generated demo (public; **not** a customer domain) |

`data/state.json` persists pilot site state; `data/jobs.jsonl` records jobs/costs.
The current test credit map is not a payment ledger and must be replaced before launch.

## Not production-ready yet

- Le lien magique (15 minutes, usage unique), les sessions HttpOnly/Secure/SameSite et l'isolation des sites par email sont implémentés et testés ; activation en production en attente d'un expéditeur email vérifié.
- Upload UI and server-side asset optimization are not implemented yet.
- No Stripe, DNS/domain onboarding, multi-site host routing or automated certificate provisioning yet.
- No customer receives or delegates a Folioflash subdomain. They will connect their own domain.

## Next (M1 order)

1. Déployer le rebrand Studio Nestor ; la vraie vitrine marketing reste à réaliser.
2. Configurer Resend + expéditeur vérifié, basculer `AUTH_MODE=magic`, puis smoke-tester en HTTPS avant de retirer Basic Auth.
3. Remplacer le fichier JSON pilote par SQLite ; conserver users, sites, domaines, jobs et ledger Stripe.
4. Upload sécurisé et optimisation WebP/variantes/EXIF ; supprimer les originaux.
5. Routage multi-domaines + TLS automatisé, Stripe test, limites et sauvegardes.
6. Pilotes, tests de restauration, charge et coût avant ouverture publique.
