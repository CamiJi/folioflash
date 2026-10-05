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
- [ ] Configurer la clé Brevo et l'expéditeur vérifié, activer `AUTH_MODE=magic` ; Basic Auth reste actif tant que l'envoi email n'est pas vérifié
- [ ] Remplacer state JSON pilote par SQLite pour comptes/sites/jobs/paiements/crédits
- [ ] Import de profil V1 par texte/document fourni par l'utilisateur ; URL LinkedIn conservée comme lien, sans scraping ; revue/confirmation avant génération
- [ ] Upload d'images : contrôles, optimisation WebP/variantes, retrait EXIF, quotas ; ne pas conserver les originaux
- [ ] Design inference structuré (palette/layout/typo), modifiable via prompt, sans code arbitraire
- [ ] Hébergement multi-sites sur le nano : routage Host, DNS du domaine client, provisionnement NPM/TLS automatisé
- [ ] Spike sécurité/capacité NPM API, builds concurrents, stockage, sauvegardes et restauration ; fixer le plafond de pilotes
- [ ] Stripe test : publication/hébergement + estimation IA préalable, webhooks idempotents, ledger et remboursement en cas d'échec
- [ ] Crédits de modification au coût LLM mesuré + petite marge ; recharges Stripe groupées pour absorber les frais fixes
- [ ] Bouton opérateur « Générer un message de soutien LinkedIn à Folioflash » : brouillon FR/EN, éditable et copiable, sans envoi automatique
- [ ] 5-10 pilotes sur leurs propres domaines, test de charge et mesure des coûts réels

## M2 — Industrialisation
- [ ] Historique et rollback, quotas et isolation renforcés, migrations/backup automatisés
- [ ] Migration vers hébergeur dédié si RAM, CPU, stockage ou trafic du serveur personnel approchent les seuils
- [ ] Blog SEO FR/EN et robot LinkedIn avec validation humaine
- [ ] Autres langues après validation de la demande

## M3 — Scale
- [ ] Multi-templates, langues supplémentaires, support DNS amélioré et partenariats
