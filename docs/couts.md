# Folioflash — Évaluation des coûts beta (à mesurer)

> Décision : les portfolios clients sont hébergés sur le serveur personnel de Camille.
> Les clients gardent et paient leurs domaines directement à leur registrar ; Folioflash
> ne vend, n'achète ni ne transfère de domaine. Les montants ci-dessous ne sont pas un
> tarif commercial : la beta vise le coût réel, à valider sur pilotes.

## 1. Coûts fixes mensuels (serveur actuel)

| Poste | Montant | Notes |
|---|---|---|
| Serveur Lightsail personnel | ~15 €/mois | Coût total existant partagé ; quote-part Folioflash à mesurer |
| NPM + Cloudflare DNS | 0 € marginal connu | Ressources existantes ; frais ops/support à compter |
| GitHub | 0 € runtime client | Utilisé pour le code produit, pas pour héberger les portfolios clients |
| Email transactionnel | 0-5 €/mois | À choisir pour auth et notifications |
| Stockage et sauvegardes | À mesurer | Builds, images optimisées, backup hors serveur |
| **Total fixe** | **À établir** | Ne pas considérer le coût du serveur partagé comme nul |

## 2. Coût marginal par site

| Poste | Coût unitaire | Facturé |
|---|---|---|
| Génération V1 observée | ~0,005 € LLM | Quelques appels OpenRouter seulement ; échantillon trop petit pour fixer le tarif |
| Modification IA | À mesurer par job | Tokens + modèle ; devis en euros avant confirmation |
| Build Astro | CPU/RAM/temps à mesurer | Builds séquentiels sur nano ; capacité à inclure |
| Images | CPU + stockage à mesurer | Conversion, variantes, volume optimisé, trafic et backup |
| Domaine client | 0 € facturé par Folioflash | Le client paie directement son registrar |
| Hébergement | Quote-part serveur à établir | Stripe possible au coût mesuré, prix annuel pas encore fixé |
| Stripe | Selon compte et moyen de paiement | Intégrer les frais réels dans l'estimation |

Mesures pilotes : une V1 de Léa a coûté environ 0,005 € en LLM et une modification ~0,004 €. Ces chiffres n'incluent ni Stripe, ni serveur, ni stockage, ni sauvegardes.

## 3. Scénarios

| Échelle | Coût mensuel | Revenu indicatif | Marge |
|---|---|---|---|
| 5 sites pilotes | Quote-part des ~15 €/mois + jobs + backup | Tarif beta au coût estimé | Mesurer capacité et coût réel |
| 25 sites | Mesurer RAM, CPU, stockage, trafic, support | Pas d'extrapolation linéaire | Migrer/upgrade avant saturation |
| 100+ sites | Serveur/stockage dédiés probablement nécessaires | Nouveau devis infra | Ne pas promettre sur le nano actuel |

## 4. Facturation beta — coût réel, tarifs à décider

Objectif : lancement pilote pas cher et au coût réel. Aucun tarif fixe ne doit être
présenté comme acté tant que la quote-part d'hébergement, stockage, sauvegardes et
frais Stripe ne sont pas mesurés.

- Stripe : paiement publication/hébergement et usage IA ; choisir avant lancement
  entre crédits prépayés et débit par job.
- IA : estimation en euros avant lancement ; journal réel de coût par appel ; échec
  de génération = pas de débit client ou remboursement idempotent.
- Domaine : aucun prélèvement Folioflash ; le créateur paie son registrar directement.
- Les amis peuvent être pilotes gratuits, avec accord explicite pour présenter leur
  portfolio dans la galerie.

Revoir les tarifs après 50 générations/modifications et test de charge/restauration.

## 5. À mesurer en M1

Logger par job/site : tokens, modèle, coût fournisseur, frais Stripe, durée, ressources
build, octets entrants/sortants, taille des assets après optimisation, stockage total,
trafic, sauvegardes et coût support. Calculer le coût par site actif avant de fixer le prix.
