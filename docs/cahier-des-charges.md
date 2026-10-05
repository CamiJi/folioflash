# Folioflash — Cahier des charges v1 (M0)

Date : 2026-10-05. Nom de travail : **Folioflash** → repo cible `CamiJi/folioflash`.
Langues produit : FR + EN au lancement, autres langues ensuite.

## 1. Vision

Générateur de portfolio **ultra-rapide, ultra-léger, pas cher** :

1. L'utilisateur s'inscrit, tape un **prompt** + dépose ses **assets** (photos, textes, liens).
2. Il reçoit une **V1 gratuite, volontairement limitée** (1 template, sous-domaine, bandeau Folioflash).
3. Si ça lui plaît, il **paie (Stripe)** : publication + domaine custom + suppressions des limites.
4. Ensuite chaque modification IA est facturée **au coût token + petite marge**, idem hébergement + domaine au prix coûtant majoré.

Positionnement : pas un concurrent de Framer/Webflow — un **« flash »** : un site statique Astro qui s'auto-héberge, < 100 Ko de JS, 95+ Lighthouse, zéro cookie en V1.

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
3. Studio : 1 écran — prompt libre + champs structurés (nom, métier, bio, 3-6 projets, liens sociaux) + upload assets (max 20 Mo en M1).
4. Clic « Générer » → job IA (~1-3 min) → **preview V1** sur `prenom.folioflash.site` avec bandeau « fait avec Folioflash ».
5. Limites V1 : 1 template, 6 projets max, pas de domaine custom, pas d'édition directe, `noindex` optionnel.

### 3.2 Déblocage payant (Stripe)
1. CTA « Publier mon site » → Checkout Stripe (compte Stripe perso au début).
2. Plan M1 : **paiement unique publication** (ex. 29 €) incluant : suppression bandeau, `index` SEO, build propre, 1 domaine custom branché.
3. Domaine : l'utilisateur choisit son URL ; on propose : (a) sous-domaine gratuit, (b) connexion domaine existant (guide DNS), (c) **achat domaine via provider** (OVH/Cloudflare Registrar, facturé prix coûtant + ~5 € frais).
4. Hébergement M1 : inclus 12 mois dans le prix de publication (mutualisé, coût ~0), puis renouvellement annuel.

### 3.3 Itérations facturées au token
1. Une fois publié : champ « modifie mon site : … » + ré-upload assets.
2. Chaque demande = job IA → **push live direct, pas de preview** (choix assumé M1, comme earlyreflect : push main → live).
3. Facturation : **crédits** (ex. 1 crédit = 1 régénération standard). Prix = coût tokens arrondi + marge (~2-3x). Affichage avant validation : « cette modif ≈ X crédits ».
4. Historique des versions (lien commit) + bouton rollback M2.

## 4. Exigences fonctionnelles

| ID | Fonction | M1 | Notes |
|---|---|---|---|
| F1 | Landing FR/EN + galerie exemples | oui | Astro statique, même stack que les portfolios générés |
| F2 | Signup + dashboard « mes sites » | oui, minimal | email+lien magique ; OAuth M2 |
| F3 | Studio prompt + assets | oui | 1 template, validation taille/type, antivirus basique (taille + mime) |
| F4 | Générateur Astro | oui | template unique dérivé d'earlyreflect, contenu en JSON/MD, `config-domain.mjs` par site |
| F5 | Pipeline live-only | oui | Phase A : 1 repo par client → GitHub Actions → Pages ; Phase B : push vers nano/Docker (voir architecture) |
| F6 | Paiement Stripe | oui | Checkout + webhooks, plans + crédits, factures Stripe |
| F7 | Domaine custom | oui | CNAME + guide DNS, HTTPS auto (Pages puis NPM/Cloudflare) |
| F8 | Blog technique/SEO | oui | Astro, 1 article/sem au début, FR+EN |
| F9 | Robot LinkedIn | M2 | repurposing auto des articles + posts vitrines, validation humaine avant publish |
| F10 | i18n sites générés | partiel | FR/EN comme earlyreflect (`/fr/`), autres langues M3 |
| F11 | Multi-templates | non (M2) | 3 templates M2 |
| F12 | Rollback / preview | non (M2) | live-only en M1, assumé |

## 5. Exigences non fonctionnelles

- **Perf** : 0 JS au chargement initial (sauf îles strictement nécessaires), images WebP responsive + lazy, façades pour YouTube/Vimeo/SoundCloud (pattern earlyreflect), Lighthouse ≥ 95.
- **Poids** : template < 300 Ko total page d'accueil (hors images projets).
- **Statique** : 100 % pré-rendu, pas de base par site publié ; seules les données du Studio sont dynamiques.
- **Confidentialité** : zéro cookie/tracker sur sites générés en V1 ; analytics M2 opt-in.
- **SEO/IA** : sitemap, robots, OG, `llms.txt` + `llms-full.txt` + `persona.json` générés à chaque build (repris d'earlyreflect).
- **Sécurité** : uploads limités (type + 20 Mo), HTML du prompt échappé, secrets Stripe uniquement côté serveur, jamais commité.
- **RGPD** : export/suppression compte, mentions légales, pas de revente de données.

## 6. Architecture (résumé — détail en `architecture.md`)

- **Phase A (M1)** : 1 repo GitHub par site client sous orga dédiée (pas le compte perso à terme) + workflow `deploy.yml` identique à earlyreflect + `config-domain.mjs` par site. L'IA pousse du MD/JSON + assets optimisés, push main = live.
- **Phase B (M2+)** : sortie GitHub : l'IA pousse vers un repo/registry interne, build Docker sur **nano** puis serveur dédié, reverse proxy NPM + Cloudflare, comme `camilleaubert-infra`.
- **Studio (M1)** : petite app hébergée sur le nano (Node + SQLite + file storage), qui orchestre : auth, jobs IA, Stripe webhooks, création repo, suivi DNS.

## 7. Modèle économique (résumé — chiffres en `couts.md`)

Freemium + crédits : V1 gratuite d'appel ; publication payante ; domaine au coût + frais ; itérations au token + marge ; hébergement annuel. Objectif : marge brute ≥ 70 % par site après Stripe + LLM.

## 8. Critères d'acceptation M1

- [ ] Un inconnu génère sa V1 en < 5 min sans aide.
- [ ] Push prompt → site live en < 5 min, sans preview.
- [ ] Paiement Stripe test → live + facture OK.
- [ ] Domaine custom branché avec HTTPS en < 24 h (guide + vérif auto).
- [ ] Lighthouse home ≥ 95 perf/a11y/SEO.
- [ ] Coût marginal mesuré par site (LLM + hosting + Stripe) consigné dans `couts.md`.

## 9. Risques

| Risque | Parade |
|---|---|
| Abus V1 gratuite (spam de générations) | rate-limit + quota/jour + captcha |
| GitHub perso saturé / limites Pages | orga dédiée dès ~20 sites, puis Phase B nano |
| Coût LLM qui dérape | plafond crédits, modèle pas cher par défaut, devis affiché avant job |
| Support DNS pour non-tech | guide FR/EN + vérif DNS auto + sous-domaine par défaut |
| Contenu illicite uploadé | CGU + signalement + suspension, modération a posteriori M1 |
