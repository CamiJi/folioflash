# Stripe — mise en route Folioflash (beta)

But : vendre des recharges de crédits de **5 €**. Pas besoin de compte bancaire
pour commencer : en mode test, puis on renseigne l'IBAN quand l'argent doit sortir.

## 1. Créer le compte (15 min, Camille)
1. https://dashboard.stripe.com/register — email + nom « Folioflash ».
2. Rester en **mode test** (interrupteur « Test » en haut). Les clés test commencent
   par `sk_test_` / `pk_test_`.
3. Plus tard : Settings → Payouts → ajouter l'IBAN pour recevoir les fonds.

## 2. Objets à créer (Dashboard test, ou API)
| Objet | Valeur beta |
|---|---|
| Product | `Crédits Folioflash` (type `service`) |
| Price | **5,00 €**, `one-time`, `billing_scheme: per_unit` |
| Customer | créé par checkout (email du compte lien magique) |
| Checkout Session | `mode: payment`, 1 × Price 5 €, `metadata: { account_email }` |
| Webhook endpoint | `https://folioflash.camilleaubert.com/api/stripe/webhook`, events `checkout.session.completed` |
| Signing secret | `whsec_...` → variable serveur `STRIPE_WEBHOOK_SECRET` |

## 3. Secrets serveur (nano `deploy/.env`, jamais Git)
`STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`,
`STRIPE_PRICE_TOPUP_5E=price_...`. Basculer en `sk_live_` après le premier test
de bout en bout réussi.

## 4. Règles d'implémentation
- Crédits crédités **uniquement** sur webhook vérifié (signature Stripe) + idempotence
  (`checkout_session.id` unique en base).
- 5 € brut → crédits nets après frais Stripe + petite marge (montant exact à fixer
  après mesure, voir `couts.md`).
- Échec de génération IA = pas de débit, ou recrédit idempotent.
