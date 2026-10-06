# Folioflash — Cahier des charges v3 (brief conversationnel)

Date : 2026-10-05. Nom : **Folioflash** — repo `CamiJi/folioflash`.
Langues produit : FR + EN au lancement, autres langues ensuite.
Décisions actées : hébergement sur le serveur personnel au départ ; chaque créateur
garde et fournit son propre nom de domaine ; Folioflash ne vend, n'achète ni ne
transfère de domaines ; Stripe pour publication et crédits IA ; crédits facturés
au coût réel des tokens plus une petite marge, montant exact à recalibrer après mesures. Interface Folioflash
inspirée de la charte Nestor le Groom ; les portfolios clients ont leur propre
direction artistique, proposée par le LLM si le brief ne précise pas de style.

## 1. Vision

Générateur de portfolio **ultra-rapide, ultra-léger, pas cher** :

1. Le créateur s'inscrit et ouvre une seule conversation pour raconter son activité ; il peut écrire, coller, dicter et déposer des images.
2. Un interviewer lui pose des questions simples une à la fois ; un évaluateur séparé vérifie que le brief tient debout et signale les angles morts.
3. Le créateur relit le résumé et confirme ; Folioflash génère une V1 Astro adaptée aux contenus dans le Studio (pas de sous-domaine client Folioflash).
4. Après validation, le créateur paie par Stripe et connecte un domaine qu'il possède déjà.
5. Le portfolio est servi depuis le serveur personnel de Camille ; chaque modification post-V1 passe par la même logique de prompt et des crédits payants.

Positionnement : pas un concurrent de Framer/Webflow — un **« flash »** : un portfolio Astro statique, rapide et léger, généré par prompt, sans éditeur complexe. Les domaines restent la propriété des clients. L'hébergement est d'abord mutualisé sur le serveur personnel, avec une limite de capacité pilote.

## 2. Utilisateurs

| Persona | Besoin |
|---|---|
| P1 — Créatif pressé (potes, premiers clients gratuits) | un portfolio propre en 1 soirée, sans toucher au code |
| P2 — Freelance / sound designer / photo / dev (type Mathieu Fiorentini) | site vite modifié par prompt, déploiement live immédiat |
| P3 — Nous (opérateur) | coût marginal ~0, facturation simple, SEO/blog qui ramène du trafic |

## 3. Parcours utilisateur

### 3.1 Découverte → profil → V1 d'essai
1. Landing (FR/EN) + galerie d'exemples réels (potes en gratuit).
2. Connexion simplifiée par lien magique email.
3. Une conversation unique démarre par « Quel nom ou pseudo veux-tu afficher, et qu'est-ce que tu fais ? ». Le créateur écrit, dicte, colle son profil/CV ou dépose ses images dans cette conversation.
4. L'interviewer mène au plus 6 messages créateur, une question utile à la fois. L'évaluateur contrôle les faits et la complétude ; il ne scrape pas LinkedIn et n'invente pas les informations manquantes.
5. Le créateur relit le résumé factuel, confirme quelles images seront publiques, puis choisit « Créer mon portfolio ».
6. Job IA → prévisualisation privée dans le Studio. Le template choisit une composition selon le contenu : mise en page éditoriale par défaut, galerie de cartes uniquement si les réalisations distinctes s'y prêtent.
7. V1 d'essai limitée à un template Astro adaptable ; aucune URL cliente en `*.folioflash.*`. La preview n'est pas le domaine public final.

**LinkedIn :** aucune lecture automatique/scraping de l'URL en V1. L'API officielle en libre accès fournit principalement le nom, le headline, la photo et l'email du membre authentifié, pas l'ensemble de son historique professionnel ; l'accès est OAuth et certaines permissions nécessitent une approbation. V1 utilise les données volontairement fournies par le titulaire. Voir [permissions LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) et [API Terms](https://www.linkedin.com/legal/l/api-terms-of-use), notamment la restriction de scraping/crawling (§3.1.24).

### 3.2 Déblocage payant (Stripe)
1. CTA « Publier » → Checkout Stripe en mode test puis live.
2. Paiement de publication et/ou d'hébergement : prix beta au coût réel, à fixer après mesure des frais serveur, Stripe et support ; ne pas afficher un tarif définitif avant validation.
3. Le client entre un domaine qu'il possède. Il garde son registrar et ses identifiants ; il configure lui-même les DNS (A/AAAA vers le serveur, CNAME `www` si souhaité). Folioflash vérifie la propagation puis provisionne le routage et HTTPS.
4. Folioflash ne propose pas l'achat, le renouvellement ni le transfert du domaine. Aucun frais de domaine n'est facturé par Folioflash.

### 3.3 Modifications par prompt et crédits payants
1. La première génération V1 est offerte une seule fois par adresse de compte ; supprimer puis recréer un site ne réinitialise pas l'offre. Toute génération ou modification ultérieure passe par des crédits et un prompt texte/voix ; pas d'éditeur manuel.
2. Recharge de crédits beta : **5 €** par transaction Stripe ; le montant de crédits disponibles tient compte des frais Stripe et de la petite marge.
3. Chaque modification débite le portefeuille selon le coût réel IA + build/compute attribuable + petite marge ; afficher l'estimation en crédits/€ avant confirmation.
4. Les crédits sont prépayés/rechargés afin d'éviter une micro-transaction Stripe par appel IA. Stripe/webhooks et journal du portefeuille doivent être idempotents.
5. Après confirmation, le LLM propose l'aperçu de modification puis le build statique publie sur le même domaine.
6. Une seule version en ligne par portfolio : pas d'historique ni de retour arrière côté utilisateur. Les gens parlent à leur portfolio, il évolue.

## 4. Exigences fonctionnelles

| ID | Fonction | M1 | Notes |
|---|---|---|---|
| F1 | Landing FR/EN + galerie exemples | oui | Astro statique, même stack que les portfolios générés |
| F2 | Signup + espace portfolio | oui, minimal | email+lien magique ; **un compte=email ↔ un portfolio actif** ; emails jetables refusés (Gmail/Proton/courants acceptés) ; suppression de portfolio (RGPD) |
| F3 | Brief conversationnel + assets | oui | Une fenêtre unique texte/voix/coller/dépôt ; interviewer + évaluateur ; 6 messages max ; budget IA brief ≤ 0,02 € ; images optimisées en WebP, EXIF retirés, originaux jamais envoyés |
| F4 | Générateur Astro + découvrabilité | oui | Template Astro/Tailwind ; brief confirmé ; éditorial par défaut, galerie seulement si justifiée ; `Person` JSON-LD, `persona.json`, canonical, robots.txt et sitemap incluant les pages et le persona |
| F5 | Build + publication | oui | Build Astro isolé/limité sur le serveur personnel ; site statique servi par domaine client depuis le même serveur |
| F6 | Paiement Stripe | oui | Checkout + webhooks, plans + crédits, factures Stripe |
| F7 | Domaine client | oui | Le client garde son domaine et son registrar ; guide DNS, vérification de propriété/résolution, routage et HTTPS auto ; aucun achat ou transfert |
| F8 | Blog technique/SEO | oui | Astro, 1 article/sem au début, FR+EN |
| F9 | Assistant LinkedIn éditorial | M2 | repurposing de blog/portfolios ; brouillons relus et publiés manuellement, aucune campagne de DM automatique |
| F10 | i18n sites générés | FR+EN auto | Toujours bilingue, sans choix de langue ; toute langue supplémentaire = job facturé en crédits |
| F11 | Multi-templates | non (M2) | 3 templates M2 |
| F12 | Version unique en ligne | oui | Pas de versions multiples ni de rollback utilisateur : chaque génération remplace la version live ; un build raté ne remplace jamais la version en ligne |
| F13 | Message de lancement LinkedIn | M1 | Bouton opérateur « Générer un message de soutien à Folioflash » ; brouillon FR/EN éditable, à copier/coller manuellement |
| F14 | Import de profil | M1 | URL LinkedIn comme référence + texte/document fourni par le membre (collage ou export LinkedIn : Réglages → Confidentialité → « Obtenir une copie de tes données ») ; extraction, brouillon à confirmer ; aucun scraping |
| F15 | Benchmark/routage modèles | M1 | Config allowlist : choisir le modèle le moins cher satisfaisant les tests qualité/coût/latence ; modèles gratuits OpenRouter candidats, pas de sélection sur le prix seul |
| F16 | Agent interviewer | M1 | Pose une question concrète à la fois ; nom/pseudo, métier, expériences, projets, images, audience, références, couleurs et contact ; refuse toute invention |
| F17 | Évaluateur de complétude | M1 | Agent distinct ; vérifie les faits essentiels et consentements ; le bouton de génération apparaît seulement quand le brief est prêt ; résumé modifiable avant confirmation |

## 5. Exigences non fonctionnelles

- **Perf** : 0 JS au chargement initial (sauf îles strictement nécessaires), images WebP responsive + lazy, façades pour YouTube/Vimeo/SoundCloud (pattern earlyreflect), Lighthouse ≥ 95.
- **Poids** : images redimensionnées et converties à l'upload ; originaux non conservés ; viser < 300 Ko de ressources initiales hors médias projet optimisés.
- **Statique** : 100 % pré-rendu, pas de base par site publié ; seules les données du Studio sont dynamiques.
- **Confidentialité** : zéro cookie/tracker sur sites générés en V1 ; analytics M2 opt-in.
- **SEO/IA** : sitemap, robots, OG, `llms.txt` + `llms-full.txt` + `persona.json` générés à chaque build (repris d'earlyreflect).
- **Indexation** : URL canonique par portfolio ; `robots.txt` référence le sitemap à cette même URL publique ; `persona.json` et ses pages sont dans le sitemap. La vitesse de crawl dépend de Google ; soumettre la propriété et le sitemap dans Search Console.
- **Sécurité** : images limitées (max 8 par site, 5 Mo/fichier source, 680 px max côté long, WebP q70, EXIF retirés, originaux traités localement puis supprimés), validation signature/dimensions, SVG/archives refusés, fichiers isolés par compte ; photos publiées seulement après confirmation ; secrets Stripe uniquement côté serveur.
- **RGPD** : export/suppression compte, mentions légales, conservation documentée des images optimisées, suppression à la demande, pas de revente de données.
- **Brief IA** : budget et tours bornés, provider/model/tokens/coûts mesurés ; les images optimisées et le texte fourni sont transmis à OpenRouter après information explicite ; aucune récupération par scraping.
- **Import LinkedIn** : le créateur fournit le contenu en le collant ou en ajoutant un document dans la conversation ; URL conservée comme référence, aucune lecture automatique.
- **Partage LinkedIn** : générer un texte seulement ; pas d'accès aux contacts, de DM groupés ni de publication automatique.

## 6. Architecture (résumé — détail en `architecture.md`)

- **Studio** : app Node + SQLite sur le serveur personnel : comptes, jobs, Stripe, uploads optimisés, sites, domaines et coûts.
- **Build** : le serveur génère les projets Astro statiques ; GitHub Actions/Pages ne sont pas le runtime des sites clients. GitHub peut rester utilisé pour versionner le code Folioflash.
- **Hébergement client** : dossiers de build isolés par site + routage Host par domaine. Intégration NPM/API ou évolution vers un proxy automatisable à trancher dans un spike avant l'onboarding multi-domaines.
- **Portabilité** : Docker, stockage et configuration séparés des données métier afin de pouvoir migrer plus tard vers un autre hébergeur.

## 7. Modèle économique (résumé — chiffres en `couts.md`)

Beta : V1 d'essai limitée ; recharge de crédits de 5 € ; modifications débitées du portefeuille au coût mesuré (LLM + build/compute) + petite marge. Frais Stripe, stockage et hébergement doivent être couverts/mesurés ; aucun produit de domaine.

## 8. Critères d'acceptation M1

- [ ] Un pilote prépare son brief et prévisualise sa V1 en < 5 min sans formulaire ni aide.
- [ ] Après paiement et DNS configuré par le client, le site est publié sur son propre domaine avec HTTPS.
- [ ] Paiement Stripe test/live et webhook idempotent validés ; estimation avant job et frais mesurés.
- [ ] Une image est optimisée avant envoi à OpenRouter et stockage ; fichier original/EXIF absents ; publication après consentement.
- [ ] Le brief tient en 6 messages utilisateur maximum ; le budget provider est plafonné à 0,02 € et inclus dans la première V1 offerte.
- [ ] Le brouillon profil issu d'un texte/document fourni est relu et confirmé avant génération ; aucune donnée n'est récupérée par scraping LinkedIn.
- [ ] Le bouton LinkedIn génère un brouillon FR/EN éditable et copiable ; il n'envoie ni ne publie rien.
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
| Informations professionnelles inventées | demander confirmation du profil extrait ; ne pas compléter les faits manquants par hallucination |
| Envoi massif LinkedIn perçu comme spam | bouton de brouillon uniquement, envoi manuel et personnalisé, aucun accès aux contacts |
