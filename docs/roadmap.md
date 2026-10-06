# Folioflash — Roadmap

## M0 — Cadrage produit (mise à jour)
- [x] CDC, architecture et coûts mis à jour : serveur personnel, domaines apportés par les créateurs, crédits IA au coût + petite marge
- [x] Style client choisi par le LLM quand le brief ne précise rien ; Folioflash Studio/marketing reprend les tokens Nestor
- [ ] Fixer prix exact après instrumentation serveur, stockage, Stripe et tests pilotes

## M1 — Produit beta auto-hébergé (en cours)
- [x] Template portfolio Astro + Tailwind, responsive FR/EN, preview `/demo/` ; identité client proposée par LLM si style absent
- [x] Génération OpenRouter et régénération texte/voix ; coût LLM observé ≈0,005 € par job test
- [x] Studio sur serveur personnel ; Basic Auth provisoire, démo accessible
- [x] Vitrine et Studio rebrandés aux couleurs Nestor (noir/crème/or, Inter/Playfair Display)
- [x] Code magic link (15 min, usage unique, confirmation anti-scanner, sessions HttpOnly/Secure/SameSite, isolation par email) + tests intégration
- [x] SMTP Brevo copié sur le nano et authentification vérifiée (aucun email envoyé) ; Basic Auth maintenu en attendant le test de livraison
- [x] Domaine retiré de la vitrine publique (FR/EN) : connexion → infos/LinkedIn → récit → site ; le DNS reste un sujet interne/opérateur
- [x] `AUTH_MODE=magic` activé avec allowlist `aubertcam@gmail.com`, lien magique demandé (202) — en attente de confirmation de réception email
- [ ] Confirmer la réception du lien magique et la connexion complète, puis retirer le Basic Auth provisoire
- [ ] Remplacer state JSON pilote par SQLite pour comptes/sites/jobs/paiements/crédits
- [ ] Import de profil V1 par texte/document fourni par l'utilisateur ; URL LinkedIn conservée comme lien, sans scraping ; revue/confirmation avant génération
- [x] Lien « Voir mon portfolio ↗ » (nouvel onglet) après chaque génération + route publique `/s/<slug>` ; version live unique, pas d'historique utilisateur
- [x] Styles par métier v1 : 6 palettes (`boucher` blanc/persil, `studio` noir/ambre, `atelier` terracotta…), 6 motifs CSS (`grille`, `onde`, `topo`…), V1 prend le style du LLM, repli déterministe par métier (vérifié : boucher ≠ illustratrice)
- [ ] Motifs visuels par métier (allowlist `motif` : topographic, waveform, blueprint, botanical, grid, halftone…) choisis par le LLM depuis l'activité, style explicite prioritaire, audit visuel par motif
- [ ] Upload d'images : contrôles, optimisation WebP/variantes, retrait EXIF, quotas ; ne pas conserver les originaux
- [ ] Design inference structuré (palette/layout/typo), modifiable via prompt, sans code arbitraire
- [ ] Hébergement multi-sites sur le nano : routage Host, DNS du domaine client, provisionnement NPM/TLS automatisé
- [ ] Spike sécurité/capacité NPM API, builds concurrents, stockage, sauvegardes et restauration ; fixer le plafond de pilotes
- [ ] Stripe test : publication/hébergement + estimation IA préalable, webhooks idempotents, ledger et remboursement en cas d'échec
- [ ] Recharge Stripe de 5 € ; crédits calculés au coût IA + compute/build + petite marge, après frais Stripe
- [ ] Bench offline de modèles OpenRouter gratuits et payants ; choisir le moins cher qui passe le seuil qualité, garder un fallback fiable
- [ ] Bouton opérateur « Générer un message de soutien LinkedIn à Folioflash » : brouillon FR/EN, éditable et copiable, sans envoi automatique
- [ ] 5-10 pilotes sur leurs propres domaines, test de charge et mesure des coûts réels

## M2 — Industrialisation
- [ ] Quotas et isolation renforcés, migrations/backup automatisés
- [ ] Migration vers hébergeur dédié si RAM, CPU, stockage ou trafic du serveur personnel approchent les seuils
- [ ] Blog SEO FR/EN et robot LinkedIn avec validation humaine
- [ ] Autres langues après validation de la demande

## M3 — Scale
- [ ] Multi-templates, langues supplémentaires, support DNS amélioré et partenariats

## Lancement — checklist (ordre proposé)
1. [ ] Lien magique confirmé de bout en bout (réception email + connexion + déconnexion), Basic Auth retiré
2. [ ] Motifs par métier implémentés et audités (au moins 3 : ex. topographic, waveform, blueprint)
3. [ ] Upload + optimisation d'images en ligne (quotas, WebP, EXIF retirés, originaux supprimés)
4. [ ] Import de profil LinkedIn (collage/document + confirmation) branché sur la génération
5. [ ] Portefeuille 5 € via Stripe test → live (estimation avant job, webhooks idempotents, remboursement si échec)
6. [ ] 3 pilotes de bout en bout (connexion → site → 1 modification payante) + mesure des coûts réels
7. [ ] Bouton brouillon LinkedIn opérateur + envoi manuel au réseau
8. [ ] Seuils nano (RAM/disque/builds) + sauvegardes/restauration testées, plafond de pilotes fixé
