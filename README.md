# Folioflash — prompt-to-portfolio in minutes

> Décris ton activité, ajoute tes images si tu en as, obtiens un portfolio Astro rapide. Crédits IA au coût mesuré + petite marge pendant la beta.

**Folioflash** vise à transformer un brief en portfolio **Astro + Tailwind** statique et bilingue. Le LLM doit proposer une direction artistique si le brief n'en précise pas ; les assets devront être optimisés côté serveur au chargement.

- 🇫🇷 Version française : voir `docs/cahier-des-charges.md`
- 📐 CDC : `docs/cahier-des-charges.md` · Architecture : `docs/architecture.md` · Marque Folioflash : `docs/brand-system.md` · Template portfolio : `docs/design-system.md` · Coûts : `docs/couts.md` · Roadmap : `docs/roadmap.md`
- 🧱 Code : `template-folio/` (Astro + Tailwind) · `studio/` (Studio Node) · `deploy/` (nano)

![status](https://img.shields.io/badge/status-M1%20prototype-orange)
![stack](https://img.shields.io/badge/stack-Astro%206%20%E2%80%A2%20Tailwind%204%20%E2%80%A2%20Stripe-orange)
![i18n](https://img.shields.io/badge/i18n-FR%20%2F%20EN-green)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

## How it works

1. **Décris** ton portfolio par texte ou par la voix ; l'upload d'images reste à construire.
2. **Prévisualise** la V1 dans le Studio. Le client n'obtiendra pas de sous-domaine Folioflash.
3. **Publie** avec ton propre domaine : tu le gardes chez ton registrar et pointes les DNS vers notre serveur (parcours à construire).
4. **Modifie** ton site par prompt ; la première génération est offerte, puis les crédits seront nécessaires (estimation avant facturation à construire).

## Stack (proven on `earlyreflect`)

- Astro + Tailwind + TypeScript, builds statiques publiés sur le serveur personnel
- Domaines clients conservés chez leurs registrars ; routage et TLS provisionnés après vérification DNS
- Optimisation des uploads et paiement Stripe restent à implémenter ; aucun code client arbitraire généré par LLM
- Landing/Studio Folioflash : identité Nestor (noir, crème, or ; Inter + Playfair Display)

## Prix beta

| Poste | Décision |
|---|---|
| Domaine | Acheté et conservé par le client auprès de son registrar ; Folioflash ne facture rien |
| Recharge de crédits | **5 € pilote proposé** ; chaque job débite le coût IA + build/compute + petite marge |
| Paiement Stripe | À implémenter ; valeur des crédits à calculer après frais Stripe |

Voir `docs/couts.md`. Le nano actuel n'est pas une capacité illimitée : nombre de pilotes plafonné après test de charge.

## Status / roadmap

- **Prototype** : Studio, génération LLM et template visibles sur le serveur.
- **M1** : lien magique confirmé, SQLite et première génération gratuite par compte intégrés ; logout/retrait Basic Auth nano, import profil, optimisation assets, benchmark modèles, domaines clients, Stripe test/live restent à traiter.
- **M2** : rollback, industrialisation et migration serveur si capacité atteinte ; blog SEO et LinkedIn validés par humain.

See `docs/roadmap.md`.

## Pilot friends

Want a free portfolio in exchange for being in the public gallery? Open an issue with title `Pilot: <your name> — <your craft>` and drop 3 links + 5 photos. First 10 in.

## License

MIT — see `LICENSE`. Generated client sites belong to their owners.
