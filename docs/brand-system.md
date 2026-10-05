# Folioflash — identité produit

## Principe

La landing page et le Studio Folioflash reprennent les **tokens visuels** de Nestor
le Groom : premium, contemporain, sobre, contrasté, élégant sans surcharge. On reprend
la palette et les rôles typographiques, pas le vocabulaire hôtelier ni les composants
spécifiques au chat/back-office de Nestor.

## Tokens de référence

| Rôle | Token | Couleur |
|---|---|---|
| Fond principal | `noir` | `#0B0B0C` |
| Surface | `noir-secondary` | `#151618` |
| Texte principal | `creme` | `#F5F3EF` |
| Texte secondaire | `creme-secondary` | `#D8D3CA` |
| Accent principal | `or` | `#C6A66B` |
| Accent secondaire | `or-secondary` | `#9B7A3D` |
| Succès / erreur | `success` / `error` | `#3E8F68` / `#B04A4A` |

Typographies : **Playfair Display** pour les titres, **Inter** pour interface et corps.
Wordmark simple, sans pictogramme complexe. Contrastes accessibles, focus visible,
layout responsive ; l'or reste un accent et ne remplace pas le texte lisible.

## Séparation indispensable

- Cette charte s'applique à la **marque Folioflash**, sa vitrine et son Studio.
- Les portfolios générés sont ceux des créateurs : ils ne prennent pas par défaut la
  palette Folioflash/Nestor. Le LLM propose une direction distincte depuis le brief,
  le métier, les assets et les projets ; une préférence explicite du client prime.
- Le style est stocké comme données/tokens contrôlés dans le projet Astro ; jamais
  comme code CSS/JS arbitraire généré par le modèle.
