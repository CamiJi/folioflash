# Studio — run + API contract (M1)

```bash
nvm use 22            # Nano: Node ≥ 22.12 requis (SQLite + Astro build)
node --experimental-sqlite server.mjs  # → http://localhost:4322
```

Env: `PORT`, `TEMPLATE_DIR` (défaut `../template-folio`), `NODE_BIN` (défaut `node`),
`LLM_PROVIDER=anthropic|openai|openrouter`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_PRICE_IN/OUT` (€/1M tokens).
Sans clé LLM : fallback local déterministe (marqué `local-fallback`, coût 0) — le pipeline reste testable.
Avec OpenRouter configuré, les erreurs API/JSON sont renvoyées (pas de fallback silencieux) et
la tentative échouée rembourse le crédit. Comptes, sites, crédits, sessions, magic links et jobs
sont persistés dans `data/folioflash.sqlite`. Au premier démarrage, `state.json` et `jobs.jsonl`
sont importés une fois ; ces fichiers restent en place comme copie de récupération. Les anciens
crédits locaux de test sont abandonnés : aucun achat réel n'existait.
En production, `AUTH_MODE=magic` est le mode produit. Le mode Basic ne sert qu'au secours opérateur. Le mode `magic`
supporte Brevo SMTP, Brevo API ou Resend et demande les identifiants du provider, un expéditeur `MAIL_FROM` vérifié,
`PUBLIC_BASE_URL` HTTPS et `SESSION_SECRET` aléatoire d'au moins 32 caractères. Tant que
le fournisseur d'email n'est pas configuré, le code reste en mode Basic ; `/demo/` reste publique.

| Method | Route | Effet |
|---|---|---|
| GET | `/` | Landing Folioflash (ou session compte déjà connectée) |
| GET | `/login` | connexion par email en mode magic ; écran de statut tant que mode Basic |
| POST | `/api/auth/request` | demande de lien (pas de réponse indiquant si un compte existe) |
| GET/POST | `/auth/verify` | page de confirmation puis échange du lien à usage unique contre session |
| POST | `/api/auth/logout` | révoque la session |
| GET | `/api/health` | `{ ok }` |
| POST | `/api/sites` | crée un site (`draft`), au plus un site actif par compte/email |
| POST | `/api/sites/:id/v1` | première génération **gratuite une seule fois par compte** ; suivantes à crédit |
| POST | `/api/sites/:id/edit` | `{ prompt }` → **1 crédit**, rebuild + redéploiement immédiat |
| GET | `/api/sites/:id` | site + crédits |

| Method | Route | Body → Response |
| GET | `/demo/` | latest generated demo (public; **not** a customer domain) |

`payments` and `ledger_entries` tables are present for the upcoming Stripe work; no checkout,
webhook or real credit purchases are implemented yet. Credits belong to the account, not the site.

## Not production-ready yet

- Le lien magique (15 minutes, usage unique), les sessions HttpOnly/Secure/SameSite et l'isolation des sites par email sont implémentés et testés ; réception + ouverture de session confirmées par Camille le 2026-10-06.
- SQLite impose un portfolio actif par compte/email ; si l'état pilote contient plusieurs sites pour un email, le premier reste actif et les autres sont conservés en archives publiques non modifiables. La suppression ne réinitialise pas le droit à la première génération gratuite.
- Upload UI and server-side asset optimization are not implemented yet.
- No Stripe, DNS/domain onboarding, multi-site host routing or automated certificate provisioning yet.
- No customer receives or delegates a Folioflash subdomain. They will connect their own domain.

## Next (M1 order)

1. Déployer le rebrand Studio Nestor ; la vraie vitrine marketing reste à réaliser.
2. Retirer le Basic Auth provisoire en production (le lien et la session ont été confirmés) ; smoke-tester aussi la déconnexion.
3. SQLite est intégré ; vérifier la migration des données réelles du nano et la restauration avant Stripe.
4. Upload sécurisé et optimisation WebP/variantes/EXIF ; supprimer les originaux.
5. Routage multi-domaines + TLS automatisé, Stripe test, limites et sauvegardes.
6. Pilotes, tests de restauration, charge et coût avant ouverture publique.
