# Folioflash — template visuel V1

## Direction

Portfolio éditorial de créatif : typographie expressive, composition asymétrique,
grandes marges, couleurs de projet et navigation discrète. Le template s'adapte
aux projets sans imposer des cartes SaaS génériques. Tant que le client n'a pas
fourni de visuels, les couvertures typographiques sont décoratives et ne prétendent
pas être ses œuvres.

## Stack et règles

- Astro statique + Tailwind CSS 4 ; les layouts utilisent des classes Tailwind,
  les composants réutilisables et détails de marque sont dans `global.css`.
- Fraunces Variable (titres) + DM Sans Variable (interface et textes), hébergées
  localement via Fontsource — aucun appel Google Fonts.
- 3 palettes (`paper`, `iris`, `forest`) en variables CSS, y compris contraste,
  accent et couvertures de projets.
- EN à la racine, FR sous `/fr/`, contenus projets avec variantes EN/FR.
- Pas de JavaScript client au chargement initial. Responsive mobile, focus visible,
  lien d'évitement et `prefers-reduced-motion` respectés.
- Builds Studio montés sous `/demo/` utilisent une base Astro `/demo/` : CSS,
  fontes, images et liens internes doivent tous préfixer cette base. Les futurs
  builds client en production seront faits à `/` ou au domaine personnalisé.

## Motifs par métier (décision produit)

Chaque portfolio adopte les codes visuels de l'activité du créateur, comme les
références internes : géologue → barres/cartes de géologie, sound designer →
ambiance studio d'enregistrement, illustratrice → gouache/couleur.

- Le LLM choisit un `motif` dans une allowlist versionnée (ex. `topographic`,
  `waveform`, `blueprint`, `botanical`, `grid`, `halftone`) + une palette, à partir
  du métier, des projets et des assets. Précisé par l'utilisateur, il prime.
- Le motif est une donnée structurée validée par le serveur, rendue en CSS/SVG
  déterministe par le template — jamais de code arbitraire généré.
- Sans visuels client, les couvertures restent typographiques/décoratives et ne
  prétendent pas être ses œuvres ; dès qu'il fournit des images, elles prennent
  le dessus (optimisées WebP côté serveur).
- Chaque nouveau motif passe l'audit visuel desktop + mobile avant d'être proposé.

## Vérification

`npm run check`, `FOLIOFLASH_PREVIEW=true npm run build`, puis audit visuel desktop
et mobile sur la démo publique avant validation du template.
