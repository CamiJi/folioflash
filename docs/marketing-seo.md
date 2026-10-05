# Folioflash — Marketing / SEO / Langues

## 1. Nom

**Folioflash** : folio (portfolio) + flash (vitesse, éclair). Court, prononçable FR/EN, logo éclair/livre facile.
À valider : dispo `.com` / `.site` / `.io` + recherche marque INPI/EUIPO avant tout print.

Alternatives écartées : Minifolio (trop générique), Quickreflect (trop proche d'earlyreflect).

## 2. Design vitrine + template

- Vitrine et template partagent les tokens : fond paper, 1 couleur brand, typo auto-hébergée, 0 JS initial.
- 3 palettes V1 au choix dans le Studio (neutre, iris/nuit, brand cálido type `#007190` repris d'earlyreflect).
- Galerie : 8-12 exemples réels (potes en gratuit, tous métiers : sound, photo, dev, design, vidéo) avec stack affichée (« Astro, 42 Ko JS, 100 Lighthouse ») — argument vente n°1.

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
