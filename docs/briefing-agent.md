# Folioflash — brief conversationnel et agents de création

Statut : spécification produit/technique M1. Cette spécification remplace le
formulaire de création multi-champs ; elle ne remplace ni le Studio, ni le
template Astro, ni l'authentification, ni le paiement futur.

## Expérience voulue

La création commence par **une seule conversation**. La personne écrit, colle du
texte, dicte au micro ou dépose des images dans la même zone. Folioflash pose une
question concrète à la fois, sans imposer un questionnaire ni un vocabulaire de
designer. Le ton reste simple et adulte, les questions courtes.

L'agent explore au fil des réponses, sans ordre rigide :

- nom affiché ou pseudo, métier et activité réelle ;
- audience et objectif du portfolio ;
- expériences et réalisations (ou confirmation qu'il n'y en a pas encore) ;
- projets : titre, rôle, période, résultat, liens ;
- photos déposées et accord pour les publier ;
- texte LinkedIn/CV fourni volontairement, sans scraping ;
- couleurs, ambiance, référence de site, ou « je te laisse choisir » ;
- façon de présenter le travail : page éditoriale, galerie, cartes seulement si
  elles servent réellement à comparer ou parcourir les réalisations ;
- moyen de contact et appel à l'action, ou choix de ne rien afficher.

Ne jamais forcer une information facultative. « Je ne sais pas », « je n'en ai
pas » et « passe » sont des réponses valides. Aucun fait professionnel ne peut
être inventé pour améliorer le score de complétude.

## Deux rôles, un même budget

1. **Interviewer** : comprend le dernier message, reconnaît ce qu'il a appris et
   pose au plus une question utile. Il ne parle pas de scores ou de champs
   techniques.
2. **Évaluateur de complétude** : relit le brief structuré et vérifie les faits,
   les angles morts et la readiness. Il distingue les informations manquantes
   des éléments optionnels ; il ne choisit jamais le design à la place du
   créateur.

À chaque réponse : l'évaluateur produit le nouvel état structuré et la priorité
de clarification ; l'interviewer formule la réponse humaine à partir de cette
priorité. Dès que les éléments essentiels sont cohérents, l'interviewer arrête
de questionner, affiche un résumé en langage courant, et propose **« Créer mon
portfolio »**. L'utilisateur peut continuer à ajouter des éléments avant de
confirmer.

### Contrat de complétude

Le bouton de création n'est activé que si le brief confirme explicitement :

- nom affiché ou pseudo ;
- activité/métier en mots compréhensibles ;
- objectif ou audience principale ;
   - au moins une expérience/réalisation, **ou** l'absence de projet à présenter ;
   - une réponse à la question « articles, interviews ou publications à montrer ? » (les publications elles-mêmes restent facultatives) ;
- une direction visuelle choisie, ou l'autorisation de proposer librement ;
- choix de publication explicite pour chaque image déposée.

Contact, lien LinkedIn, références visuelles, couleurs précises et photos restent
facultatifs. Le score n'est pas montré comme une note à l'utilisateur. L'écran
présente plutôt « Il me manque encore… » avec une phrase concrète.

## Tours et maîtrise des coûts

- Maximum de **6 messages utilisateur** par session de brief ; les réponses
  « je ne sais pas » comptent comme un tour mais permettent de passer le sujet.
- Au maximum un appel évaluateur et un appel interviewer par tour. Si le brief
  est prêt, l'appel interviewer est remplacé par un message de confirmation.
- OpenRouter utilise le modèle configuré (`LLM_MODEL`, pilote
  `google/gemini-3.7-flash`). Le brief a un budget cumulé de **0,02 €**, un
  maximum de sortie et une réserve conservatrice par appel. Coût provider et
  budget consommé sont journalisés séparément ; un appel échoué réserve aussi
  une petite marge pour empêcher un dépassement par répétition.
- Le budget du brief fait partie du coût de la première V1 offerte ; aucune
  recharge ne peut être déclenchée au milieu de la conversation. Si la limite est
  atteinte, le Studio explique ce qu'il manque sans démarrer la génération.
- Historique transmis tronqué et borné ; pas de boucle autonome, d'outil externe,
  de scraping LinkedIn ni d'exécution de code.
- Les appels de brief et la génération V1 sont deux postes mesurés séparément.
  Le budget réel est revu après les pilotes avant de fixer un prix commercial.

## Images dans la conversation

- JPEG/PNG/WebP seulement, maximum 8 fichiers, 5 Mo par source.
- Le navigateur redimensionne au plus grand côté 680 px et réencode en WebP
  qualité 70 avant l'envoi ; EXIF supprimés, SVG animé/archives refusés.
- Maximum 700 Ko par image après conversion. Les originaux ne quittent pas le
  navigateur et ne sont jamais conservés.
- Le Studio conserve seulement les WebP optimisés, isolés par portfolio, en
  attendant leur utilisation par le générateur. Ils sont supprimés avec le site.
- Les images et leurs noms sont transmis à OpenRouter pour l'analyse du brief.
  Le résumé avant création indique lesquelles seront publiées ; aucune photo
  n'est incluse dans le site sans confirmation.
- L'évaluateur ne peut référencer que les IDs d'image fournis par le serveur. Le
  générateur associe les images aux réalisations ; une image inconnue est ignorée.

## Données structurées

`briefProfile` versionné contient uniquement des informations confirmées :

```json
{
  "version": 1,
  "displayName": "…",
  "nameIsPseudonym": false,
  "craft": "…",
  "audience": "…",
  "goal": "…",
  "bio": "…",
  "experiences": [],
  "projects": [{"title":"…","role":"…","years":"…","summary":"…","url":"…","assetIds":[]}],
  "articles": [{"title":"…","publisher":"…","year":"…","summary":"…","url":"…"}],
  "articlesReviewed": false,
  "visual": {"preference":"…","references":[],"allowCreativeDirection":true},
  "layout": {"preference":"…","cardsJustified":false},
  "contact": {"email":"…","website":"…","linkedin":"…","cta":"…"},
  "imagesApproved": true,
  "completeness": {"ready": false,"missing":[],"turn":1}
}
```

Le serveur nettoie/borne les champs et valide les IDs avant d'écrire le profil.
Le générateur reçoit le profil confirmé, pas les messages bruts comme unique
brief. Le template choisit une composition adaptée au contenu : pas de cartes
par défaut ; les images n'occupent une place que si elles montrent réellement le
travail.

## Interface

- Un seul fil de conversation, une seule zone de saisie ; aucune page de champs
  séparés pour le nom, les couleurs ou le CV.
- Zone de saisie multiligne, micro intégré, collage natif, bouton « + » pour
  joindre des images et dépôt par glisser-déposer.
- Aperçus amovibles des images avant envoi.
- Réponses lisibles sur mobile, typographie Folioflash existante, phrases
  courtes, focus visible, `role=log`/annonces accessibles et respect de
  `prefers-reduced-motion`.
- En fin de brief : résumé factuel modifiable dans la conversation, photos
  incluses listées clairement, bouton de création distinct. La V1 reste la
  première génération gratuite du compte.

## Critères d'acceptation

- Une personne peut créer un brief uniquement par conversation, sans toucher à
  un formulaire structuré.
- L'interviewer ne pose pas deux questions dans la même réponse ; l'évaluateur
  expose les manques avant la confirmation.
- Aucune génération tant que le seuil essentiel ou le consentement image manque.
- Les champs « projets inexistants », « pas de style choisi » et « pseudo » sont
  compris comme des choix, pas comme des erreurs.
- Le nombre de tours, tokens, coût OpenRouter, modèle, coût du build et coût des
  images sont mesurables par génération.
- Un test confirme que le coût du brief ne dépasse pas le budget configuré, que
  les dépassements arrêtent les appels, et que les échecs ne consomment pas la
  génération gratuite.
- Une photo ne peut ni sortir de son compte, ni devenir publique sans accord.
