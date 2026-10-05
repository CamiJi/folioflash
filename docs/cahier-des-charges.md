# Folioflash — Cahier des charges v2 (décisions produit)

Date : 2026-10-05. Nom : **Folioflash** — repo `CamiJi/folioflash`.
Langues produit : FR + EN au lancement, autres langues ensuite.
Décisions actées : hébergement sur le serveur personnel au départ ; chaque créateur
garde et fournit son propre nom de domaine ; Folioflash ne vend, n'achète ni ne
transfère de domaines ; Stripe pour publication et consommation IA ; prix beta
au coût réel, montant exact à recalibrer après mesures. Interface Folioflash
inspirée de la charte Nestor le Groom ; les portfolios clients ont leur propre
direction artistique, proposée par le LLM si le brief ne précise pas de style.

## 1. Vision

Générateur de portfolio **ultra-rapide, ultra-léger, pas cher** :

1. Le créateur s'inscrit, écrit ou dicte son brief, ajoute éventuellement ses images et liens.
2. Folioflash génère une V1 Astro dans une prévisualisation Studio (pas de sous-domaine client Folioflash).
3. Après validation, le créateur paie par Stripe et connecte un domaine qu'il possède déjà.
4. Le portfolio est servi depuis le serveur personnel de Camille ; chaque modification IA est chiffrée avant lancement et débitée par Stripe selon le coût réel mesuré.

Positionnement : pas un concurrent de Framer/Webflow — un **« flash »** : un portfolio Astro statique, rapide et léger, généré par prompt, sans éditeur complexe. Les domaines restent la propriété des clients. L'hébergement est d'abord mutualisé sur le serveur personnel, avec une limite de capacité pilote.

## 2. Utilisateurs

| Persona | Besoin |
|---|---|
| P1 — Créatif pressé (potes, premiers clients gratuits) | un portfolio propre en 1 soirée, sans toucher au code |
| P2 — Freelance / sound designer / photo / dev (type Mathieu Fiorentini) | site vite modifié par prompt, déploiement live immédiat |
| P3 — Nous (opérateur) | coût marginal ~0, facturation simple, SEO/blog qui ramène du trafic |

## 3. Parcours utilisateur

### 3.1 Découverte → V1 gratuite
1. Landing (FR/EN) + galerie d'exemples réels (potes en gratuit).
2. Signup minimal (email + OAuth GitHub/Google en M2).
3. Studio : prompt libre texte ou voix, champs structurés et dépôt optionnel d'images.
4. Clic « Générer » → job IA → aperçu privé dans le Studio, avec style proposé à partir du métier, des projets et du brief si aucun style n'est demandé.
5. V1 limitée à un template Astro adaptable ; aucune URL cliente en `*.folioflash.*`. La preview n'est pas le domaine public final.

### 3.2 Déblocage payant (Stripe)
1. CTA « Publier » → Checkout Stripe en mode test puis live.
2. Paiement de publication et/ou d'hébergement : prix beta au coût réel, à fixer après mesure des frais serveur, Stripe et support ; ne pas afficher un tarif définitif avant validation.
3. Le client entre un domaine qu'il possède. Il garde son registrar et ses identifiants ; il configure lui-même les DNS (A/AAAA vers le serveur, CNAME `www` si souhaité). Folioflash vérifie la propagation puis provisionne le routage et HTTPS.
4. Folioflash ne propose pas l'achat, le renouvellement ni le transfert du domaine. Aucun frais de domaine n'est facturé par Folioflash.

### 3.3 Itérations facturées au token
1. Une fois publié : champ « modifie mon site » texte/voix + ajout éventuel d'images.
2. Le LLM propose un aperçu de la modification ; après confirmation, build statique et publication sur le même domaine.
3. Avant chaque génération, afficher une estimation en euros fondée sur le modèle, les tokens et les frais de paiement. Le client confirme avant consommation ; Stripe et la comptabilité des jobs doivent être idempotents.
4. Historique de versions et rollback avant ouverture à grande échelle.

## 4. Exigences fonctionnelles

| ID | Fonction | M1 | Notes |
|---|---|---|---|
| F1 | Landing FR/EN + galerie exemples | oui | Astro statique, même stack que les portfolios générés |
| F2 | Signup + dashboard « mes sites » | oui, minimal | email+lien magique ; OAuth M2 |
| F3 | Studio prompt + assets | oui | Images optimisées côté serveur au chargement : validation réelle du format, redimensionnement, WebP, suppression EXIF, quota ; originaux temporaires supprimés après conversion |
| F4 | Générateur Astro | oui | Template unique Astro + Tailwind ; contenu structuré, style proposé par le LLM si absent ; jamais de code arbitraire |
| F5 | Build + publication | oui | Build Astro isolé/limité sur le serveur personnel ; site statique servi par domaine client depuis le même serveur |
| F6 | Paiement Stripe | oui | Checkout + webhooks, plans + crédits, factures Stripe |
| F7 | Domaine client | oui | Le client garde son domaine et son registrar ; guide DNS, vérification de propriété/résolution, routage et HTTPS auto ; aucun achat ou transfert |
| F8 | Blog technique/SEO | oui | Astro, 1 article/sem au début, FR+EN |
| F9 | Robot LinkedIn | M2 | repurposing auto des articles + posts vitrines, validation humaine avant publish |
| F10 | i18n sites générés | partiel | FR/EN comme earlyreflect (`/fr/`), autres langues M3 |
| F11 | Multi-templates | non (M2) | 3 templates M2 |
| F12 | Historique / rollback | M2 | La preview existe dans le Studio ; conserver la dernière version live si build échoue |

## 5. Exigences non fonctionnelles

- **Perf** : 0 JS au chargement initial (sauf îles strictement nécessaires), images WebP responsive + lazy, façades pour YouTube/Vimeo/SoundCloud (pattern earlyreflect), Lighthouse ≥ 95.
- **Poids** : images redimensionnées et converties à l'upload ; originaux non conservés ; viser < 300 Ko de ressources initiales hors médias projet optimisés.
- **Statique** : 100 % pré-rendu, pas de base par site publié ; seules les données du Studio sont dynamiques.
- **Confidentialité** : zéro cookie/tracker sur sites générés en V1 ; analytics M2 opt-in.
- **SEO/IA** : sitemap, robots, OG, `llms.txt` + `llms-full.txt` + `persona.json` générés à chaque build (repris d'earlyreflect).
- **Sécurité** : limite d'upload configurable (proposition pilote : 20 Mo/image), vérification magic bytes, refus SVG/archives au lancement, EXIF retiré, fichiers isolés par compte, stockage temporaire nettoyé, quotas, secrets Stripe uniquement côté serveur.
- **RGPD** : export/suppression compte, mentions légales, conservation documentée des images optimisées, suppression à la demande, pas de revente de données.

## 6. Architecture (résumé — détail en `architecture.md`)

- **Studio** : app Node + SQLite sur le serveur personnel : comptes, jobs, Stripe, uploads optimisés, sites, domaines et coûts.
- **Build** : le serveur génère les projets Astro statiques ; GitHub Actions/Pages ne sont pas le runtime des sites clients. GitHub peut rester utilisé pour versionner le code Folioflash.
- **Hébergement client** : dossiers de build isolés par site + routage Host par domaine. Intégration NPM/API ou évolution vers un proxy automatisable à trancher dans un spike avant l'onboarding multi-domaines.
- **Portabilité** : Docker, stockage et configuration séparés des données métier afin de pouvoir migrer plus tard vers un autre hébergeur.

## 7. Modèle économique (résumé — chiffres en `couts.md`)

Beta au coût réel : V1 d'essai limitée ; Stripe pour publication/hébergement et consommation IA ; aucun produit de domaine. Tarif exact après mesure des coûts serveur mutualisés, Stripe, LLM, stockage et sauvegardes.

## 8. Critères d'acceptation M1

- [ ] Un pilote génère et prévisualise sa V1 en < 5 min sans aide.
- [ ] Après paiement et DNS configuré par le client, le site est publié sur son propre domaine avec HTTPS.
- [ ] Paiement Stripe test/live et webhook idempotent validés ; estimation avant job et frais mesurés.
- [ ] Une image originale est optimisée avant stockage durable ; le fichier original et les EXIF ne sont pas conservés.
- [ ] Une panne de build ne remplace pas la dernière version publiée.
- [ ] Lighthouse home ≥ 95 perf/a11y/SEO.
- [ ] Coût marginal mesuré par site (LLM + hosting + Stripe) consigné dans `couts.md`.

## 9. Risques

| Risque | Parade |
|---|---|
| Abus de génération gratuite | auth, rate-limit, quota, CAPTCHA et plafond de coûts |
| Nano saturé (CPU/RAM/disque/traffic) | limite stricte de pilotes, builds séquentiels, métriques et migration avant saturation |
| Coût LLM qui dérape | plafond crédits, modèle pas cher par défaut, devis affiché avant job |
| Support DNS pour non-tech | guide FR/EN, diagnostic DNS automatique ; le client garde le domaine |
| Nano saturé (builds, images, requêtes simultanées) | test de charge, quota, file séquentielle, alertes disque/RAM, plafond de pilotes avant vente |
| Contenu illicite uploadé | CGU + signalement + suspension, modération a posteriori M1 |
