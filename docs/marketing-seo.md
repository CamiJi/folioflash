# Folioflash — Marketing / SEO / Langues

## 1. Nom

**Folioflash** : folio (portfolio) + flash (vitesse, éclair). Court, prononçable FR/EN.
L'URL vitrine actuelle est un sous-domaine de `camilleaubert.com` ; nom de domaine
propre et recherche de marque resteront à décider pour la marque Folioflash elle-même.

Alternatives écartées : Minifolio (trop générique), Quickreflect (trop proche d'earlyreflect).

## 2. Identité Folioflash et portfolios clients

- Landing + Studio : charte Nestor adaptée à la marque produit (noir `#0B0B0C`, crème `#F5F3EF`, or doux `#C6A66B`, Playfair Display + Inter). Détails dans `brand-system.md`.
- Sites clients : identité autonome. Si le créateur n'indique pas de style, le LLM propose un thème adapté au métier, aux projets et aux assets ; sa proposition est modifiable avant publication.
- Galerie : exemples réels de pilotes, tous métiers, avec autorisation explicite. N'afficher des métriques Lighthouse/poids qu'après mesure réelle.
- Pas d'offre de domaine : chaque client garde le sien et paie son registrar ; Folioflash explique le pointage DNS vers le serveur.

## 3. Contenu SEO (blog)

Blog Astro FR/EN, 1 article/sem au début :
- technique : « pourquoi un portfolio statique bat Framer en perf », « images WebP responsive », « façades vidéo », « llms.txt pour être cité par les IA » ;
- univers portfolio : avant/après, teardowns, pricing transparents (nos coûts publiés = confiance).
Chaque article EN+FR, `llms.txt` de la vitrine à jour.

## 4. Robot LinkedIn (M2)

- Source = articles blog + mises en ligne de beaux portfolios (avec accord).
- 2-3 posts/sem, validation humaine obligatoire avant publish (bouton dans le Studio).
- Métrique : visites galerie → signup V1. Pas d'auto-DM, pas de spam.

## 5. Langues

M1 : vitrine + template + Studio en **FR/EN** (même routing qu'earlyreflect : EN racine, FR sous `/fr/`).
M3 : ES/DE/IT si > 20 % du trafic — contenus découplés (`i18n/ui.ts`) pour ne pas refactorer.
