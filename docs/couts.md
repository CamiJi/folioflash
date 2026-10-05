# Folioflash — Évaluation des coûts (ordres de grandeur, à valider)

> Base : infra existante (serveur Ubuntu + NPM + Cloudflare, cf. `camilleaubert-infra`),
> pattern earlyreflect (Pages = 0 €), nano = orchestrateur uniquement (pas de build local).
> Prix indicatifs EU 2026, HT. À re-mesurer en M1 avec 10 sites pilotes.

## 1. Coûts fixes mensuels (M1, Phase A GitHub)

| Poste | Montant | Notes |
|---|---|---|
| Nano existant (amorti) | 0 € marginal | Studio léger (Node+SQLite) ; pas de MySQL dessus |
| Nom de domaine vitrine (folioflash.site/.com) | ~1 €/mois | ~12-15 €/an |
| GitHub Pages + Actions (≤ 20 sites) | 0 € | quotas publics/privés à surveiller |
| Cloudflare (DNS) | 0 € | plan gratuit |
| Email transactionnel (lien magique, factures) | 0-5 € | provider type Resend/Brevo, volume faible |
| **Total fixe M1** | **~1-6 €/mois** | |

## 2. Coût marginal par site

| Poste | Coût unitaire | Facturé |
|---|---|---|
| Génération V1 (LLM, modèle pas cher, ~50-150k tokens in/out) | ~0,30-1,50 € | 0 € (appel) |
| Régénération / modif (même ordre) | ~0,20-1,00 € | 1 crédit ≈ 3-5 € |
| Publication (build Pages) | ~0 € | prix publication (ex. 29 €) |
| Domaine custom (.com/.fr, an 1) | ~10-15 € | prix coûtant + ~5 € frais |
| Hébergement mutualisé an 1 | ~0 € (Pages) | inclus publication |
| Renouvellement hébergement (Phase B, serveur dédié amorti /100 sites) | ~0,50-1,50 €/an/site | ~9-19 €/an |
| Stripe | 1,5 % + 0,25 € (EU) | répercuté dans les prix |

Exemple : 10 potes en gratuit → coût LLM ~5-15 € one-shot, hosting 0 €. Soutenable comme investissement galerie.

## 3. Scénarios

| Échelle | Coût mensuel | Revenu indicatif | Marge |
|---|---|---|---|
| 10 sites (8 gratuits, 2 payants à 29 €) | ~10 € | ~58 € one-shot | ~80 % |
| 100 sites (30 payants + crédits ~150 €) | ~30-50 € (orga GitHub éventuelle + serveur) | ~1 000 € | ≥ 70 % |
| 1 000 sites | Phase B obligatoire (serveur 20-60 €/mois) | ~30 k€ cumulé | ≥ 70 % si crédits bien calibrés |

## 4. Prix TEST — prix coûtant (décision 2026-10-05)

Objectif : pas cher, pour tester. On facture au coût réel, sans marge sauf Stripe incompressible.

- Publication : **29 € TTC** (tout compris : génération V1 + build + SEO/llms + connexion domaine + 1 an d'hébergement sous-domaine ou domaine connecté).
- Crédit modif IA : **~2 € / crédit** (1 régénération standard = 1 crédit, grosse refonte = 2-3, devis affiché avant le job).
- Domaine acheté pour le client : **prix coûtant + 5 € de frais**.
- Renouvellement hébergement : **12 €/an** (sous-domaine) / **19 €/an** (domaine custom).
- Potes pilotes : **gratuit** (V1 + publication offerte en échange de la galerie publique).

On re-mesure après 50 jobs et on ajuste — les prix ci-dessus sont l'hypothèse de test.

## 5. À mesurer en M1

Logger par job : tokens in/out, modèle, durée, coût estimé → tableau de bord + ajustement prix crédits après 50 jobs.
