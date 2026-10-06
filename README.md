# Folioflash — prompt-to-portfolio in minutes

> Une conversation pour comprendre ton travail, puis un portfolio Astro rapide qui lui ressemble. Crédits IA au coût mesuré + petite marge pendant la beta.

**Folioflash** transforme une conversation en brief confirmé, puis en portfolio **Astro + Tailwind** statique et bilingue. Une composition éditoriale est le point de départ ; les cartes et galeries ne sont utilisées que si le contenu le justifie.

- 🇫🇷 Version française : voir `docs/cahier-des-charges.md`
- 📐 CDC : `docs/cahier-des-charges.md` · Brief et agents : `docs/briefing-agent.md` · Architecture : `docs/architecture.md` · Marque Folioflash : `docs/brand-system.md` · Template portfolio : `docs/design-system.md` · Coûts : `docs/couts.md` · Roadmap : `docs/roadmap.md`
- 🧱 Code : `template-folio/` (Astro + Tailwind) · `studio/` (Studio Node) · `deploy/` (nano)

![status](https://img.shields.io/badge/status-M1%20prototype-orange)
![stack](https://img.shields.io/badge/stack-Astro%206%20%E2%80%A2%20Tailwind%204%20%E2%80%A2%20Stripe-orange)
![i18n](https://img.shields.io/badge/i18n-FR%20%2F%20EN-green)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

## How it works

1. **Parle** dans une seule fenêtre : écris, dicte, colle ton LinkedIn/CV ou dépose des photos.
2. **Précise** ton projet avec l'interviewer ; l'évaluateur vérifie que le brief est assez complet, sans inventer de faits.
3. **Relis** le résumé et choisis les images à publier ; la première V1 est générée après ta confirmation.
4. **Prévisualise** dans le Studio. Pas de sous-domaine Folioflash ; tu gardes ton domaine chez ton registrar.
5. **Modifie** le site dans une conversation ; les changements suivants utilisent des crédits.

## Stack (proven on `earlyreflect`)

- Astro + Tailwind + TypeScript, builds statiques publiés sur le serveur personnel
- Domaines clients conservés chez leurs registrars ; routage et TLS provisionnés après vérification DNS
- Brief OpenRouter borné à 6 messages et 0,02 € par compte ; images converties en WebP dans le navigateur avant l'envoi
- Paiement Stripe, routage de domaines et sauvegarde/restauration automatisés restent à implémenter ; aucun code client arbitraire généré par LLM
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
- **M1** : lien magique, SQLite, brief conversationnel, upload WebP et première génération gratuite intégrés ; restent logout smoke-test, benchmark visuel/coût, domaines clients, backups restaurés et Stripe test/live.
- **M2** : rollback, industrialisation et migration serveur si capacité atteinte ; blog SEO et LinkedIn validés par humain.

See `docs/roadmap.md`.

## Pilot friends

Want a free portfolio in exchange for being in the public gallery? Open an issue with title `Pilot: <your name> — <your craft>` and drop 3 links + 5 photos. First 10 in.

## License

MIT — see `LICENSE`. Generated client sites belong to their owners.
