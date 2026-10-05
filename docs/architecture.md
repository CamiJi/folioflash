# Folioflash — Architecture cible (serveur personnel)

## 1. Ce qu'on réutilise tel quel

`sideprojects/earlyreflect/` reste une référence pour la qualité du build Astro,
la structure de contenu, l'optimisation d'images et la découvrabilité — pas pour
l'hébergement client. Décision : les portfolios clients sont publiés sur le serveur
personnel de Camille avec le domaine que chaque créateur possède déjà.

- **Astro 6 + Tailwind 4 + TS**, 100 % statique, `npm run build → dist/`.
- **Astro + Tailwind** : génération de sites statiques légers et reproductibles.
- **Contenu en collections Markdown bilingues** `src/content/projects/{en,fr}/{slug}.md` + `src/data/site.ts` + `src/data/pages.ts` + `src/i18n/ui.ts`.
- **Images** : `scripts/optimize-image.mjs` (brut → WebP responsive) + composants `WpImage`, façades `LiteYouTube/LiteVimeo/SoundCloudFacade` (iframe au clic), `AudioPlayer` natif.
- **Discoverability IA** : `llms.txt`, `llms-full.txt`, `persona.json` générés depuis le contenu, crawlers IA autorisés.
- **i18n** : EN à la racine, FR sous `/fr/`, `prefixDefaultLocale: false`.
- Les workflows GitHub peuvent déployer le code du produit, mais GitHub Pages n'héberge pas les portfolios clients.

## 2. Template Folioflash V1 (1 seul en M1)

Dérivé du template Folioflash déjà amorcé ; un seul modèle Astro/Tailwind au lancement :

```
template-folio/
├── config-domain.mjs        # domaine apporté par le client, base de build
├── src/content/projects/    # projets structurés et variantes EN/FR
├── src/data/site.json       # profil, style proposé, contact et liens
├── src/pages/               # home, work, about, contact (FR/EN)
├── src/styles/global.css    # 3 palettes au choix (tokens CSS)
└── scripts/                 # audit, gen-og, gen-llms ; optimisation au Studio
```

Le LLM fournit un objet structuré validé par le serveur : profil, projets FR/EN,
palette, typographies/layout issus d'options autorisées. Si le brief ne précise pas
de style, il propose une direction adaptée au métier et aux projets. Il ne produit
jamais de code arbitraire.

## 3. Pipeline de génération et publication

```
Studio → prompt + assets temporaires
  → validation + optimisation d'images (WebP, redimensionnement, EXIF supprimé)
  → LLM → contenu et style structurés
  → build Astro limité en ressources, dans une file de jobs
  → validation des pages/liens
  → publication atomique : garder l'ancien build si le nouveau échoue
  → serveur statique sélectionne le site selon le Host du domaine client
```

- Preview temporaire dans le Studio ; pas de sous-domaine Folioflash remis au client.
- DNS reste chez le client : A/AAAA vers le serveur et éventuellement CNAME `www`.
- Après vérification DNS, provisionner automatiquement routage et certificat HTTPS.
- Garder chaque dernière release intacte ; publier par bascule atomique et conserver
  au minimum une release de rollback.

Le routage TLS multi-domaines via NPM/API doit faire l'objet d'un spike : l'API
nécessite des identifiants de service à protéger. Évaluer permissions minimales,
création/renouvellement de certificats, suppression de hosts et récupération après
échec avant de l'automatiser pour des clients.

## 4. Hébergement et capacité

- M1 : même Lightsail/NPM/Cloudflare que les projets personnels ; stockage par site
  sur volume dédié, conteneur statique isolé du Studio et du proxy.
- La contrainte importante est la capacité réelle, pas le coût théorique : le nano
  fait environ 2 Go RAM et Folioflash + Nestor + portfolio partagent déjà le serveur.
- Sérialiser les builds, fixer heap/timeout, limites disque par compte, nettoyage des
  temporaires et sauvegarde des builds/données.
- Tester charge HTTP, disque, RAM et restauration avant d'accepter plus que quelques
  pilotes. Définir un seuil de migration vers serveur dédié.
- Garder les images Docker, volumes, DNS et base configurables pour migrer plus tard.

## 5. Studio sur le serveur personnel

- Node 22 + SQLite (persistée) pour comptes, sites, domaines, jobs, paiements et crédits.
- Worker de build isolé et borné ; stockage d'images d'abord local avec quota et backup.
- Pipeline upload : contrôles MIME et signature fichier, dimensions/poids, conversion
  WebP, variantes responsive, EXIF supprimés ; originaux traités en zone temporaire,
  puis supprimés. SVG non fiable rejeté en V1.
- Stripe Checkout + webhooks signés et idempotents ; journal de transactions et
  consommation IA traçable par job.
- Auth temporaire Basic Auth remplacée par authentification produit avant ouverture.
- Secrets d'API et NPM uniquement dans variables/fichiers runtime protégés, jamais Git.

## 6. Sélection et benchmarks des modèles

- Maintenir une allowlist versionnée de modèles/providers (dont modèles gratuits
  OpenRouter candidats), avec prix observé, contexte, limites, disponibilité et qualité.
- Bench offline représentatif FR/EN : fidélité factuelle au profil, projets omis ou
  inventés, traduction, direction artistique, JSON valide, retouches par prompt,
  latence, taux d'échec et coût réel.
- Sélectionner le modèle le moins cher **parmi ceux qui passent le seuil qualité** ;
  conserver un fallback fiable si le gratuit est indisponible ou rate-limité.
- Ne jamais router aveuglément vers un modèle gratuit/non évalué, ni facturer plus que
  l'estimation annoncée. Recalculer les coûts après chaque job ; prix/limites OpenRouter
  et disponibilités gratuites peuvent changer.
- Ne pas utiliser les prompts/profils clients pour benchmarker ou entraîner sans accord ;
  commencer avec un jeu de test synthétique/anonymisé.

## 7. Ce qu'on ne fait pas au lancement

Enregistrement/achat de domaines, délégation/transfert DNS, GitHub Pages par client,
éditeur drag&drop, multi-templates, langues au-delà de FR/EN, analytics non essentiels.
