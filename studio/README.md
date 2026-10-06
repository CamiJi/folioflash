# Studio — conversation-first portfolio brief (M1)

```bash
nvm use 22            # Nano: Node ≥ 22.19 requis (SQLite + template dependencies)
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
| GET | `/studio` | conversation de brief (nouveau portfolio) ou prompt d'édition (portfolio existant) |
| POST | `/api/sites` | crée un brouillon vide pour le fil de conversation ; un portfolio actif par compte/email |
| POST | `/api/sites/:id/assets` | WebP optimisé ≤ 700 Ko ; 8 fichiers maximum, accès privé au compte |
| GET/POST | `/api/sites/:id/brief` | état du fil / message → interviewer + évaluateur, readiness, résumé, coût et compteur de tours |
| POST | `/api/sites/:id/brief/start` | démarre un rebrief explicite depuis le portfolio live (uniquement si génération/crédits autorisés) |
| POST | `/api/sites/:id/brief/cancel` | garde l'ancien portfolio live et abandonne le nouveau brief |
| GET | `/api/sites/:id/assets/:assetId` | lit une image optimisée privée appartenant au portfolio |
| POST | `/api/sites/:id/v1` | brief confirmé → première génération **gratuite une fois par compte** |
| POST | `/api/sites/:id/edit` | `{ prompt }` → **1 crédit**, rebuild + redéploiement immédiat |
| GET | `/api/sites/:id` | site + crédits |

| Method | Route | Body → Response |
| GET | `/demo/` | latest generated demo (public; **not** a customer domain) |

`payments` and `ledger_entries` tables are present for the upcoming Stripe work; no checkout,
webhook or real credit purchases are implemented yet. Credits belong to the account, not the site.

## Brief IA et images

- Deux rôles OpenRouter distincts : évaluateur factuel puis interviewer. Six messages créateur maximum et budget cumulé de 0,02 € par compte ; compteurs conservés même si le brouillon est supprimé.
- Le navigateur convertit les JPG/PNG/WebP en WebP q70, côté long 680 px ; l'original n'est pas envoyé. Le serveur vérifie WebP/dimensions, garde le WebP privé et le publie seulement si le créateur l'a confirmé.
- Le profil structuré et les projets sont confirmés avant le build. Le template affiche expériences et publications ; éditorial sans cartes par défaut, galerie seulement avec plusieurs images confirmées.

## Encore à construire

- Mesurer les coûts du brief et de la génération réelle sur des pilotes ; le mode sans clé reste un fallback de développement simple, pas l'agent de production.
- Stripe test, Checkout, webhook/idempotence et portefeuille réel ; aucun achat de crédit n'existe encore.
- Routage de domaines clients, provisionnement TLS automatisé, test de restauration et capacité.
- Pas de sous-domaine Folioflash remis au client : chacun connectera son domaine.

## Next (M1 order)

1. Smoke-tester la déconnexion Magic Link en production.
2. Valider trois vrais briefs ; contrôler les faits, les questions, le coût ≤ 0,02 € et les layouts sans cartes inutiles.
3. Auditer au moins trois sites : texte seul, expériences/articles, projets avec photos.
4. Tester sauvegarde/restauration SQLite + images optimisées ; fixer le plafond de pilotes.
5. Implémenter Stripe test : recharge 5 €, webhooks idempotents, ledger et remboursement en échec.
6. Pilotes de bout en bout, coûts réels et charge avant ouverture publique.
