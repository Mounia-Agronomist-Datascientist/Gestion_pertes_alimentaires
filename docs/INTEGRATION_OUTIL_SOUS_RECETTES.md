# Intégration de l'outil « Pertes Production » (sous-recettes par équipe)

Analyse du 06/11/2026 de l'outil réalisé par un collègue (cahier des charges §17), à partir de son code
public (`pertes-productions.netlify.app`). Aucun accès aux données n'a été fait à ce stade.

> Sécurité : l'URL Apps Script et le code PIN de cet outil ne doivent **jamais** être enregistrés dans ce dépôt.

## 1. Ce que fait l'outil

- Application web (PWA) sur tablette, sans compte individuel : un **code PIN commun** + le prénom de la personne.
- Données stockées dans un **Google Sheet**, servi par un script Google Apps Script (actions `data`, `add`, `cancel`).
- Source : le **« tome » extrait de Melba** (livre de production de la semaine), réparti par équipe.
- Saisie organisée par **équipe → recette (plat) → sous-recette → ingrédient**, avec trois niveaux de perte :

| Niveau | Unité | Exemple |
|---|---|---|
| `recette` | portions | plats finis / barquettes perdus |
| `sous_recette` | kg | partie d'une préparation |
| `ingredient` | unité du tome | casse d'un ingrédient |

- Saisie hors ligne : les pertes sont mises en file d'attente sur la tablette et envoyées au retour du réseau.

## 2. Format des données (déduit du code)

### Plan de production (`prod`) — une ligne par ingrédient de sous-recette

| Champ | Contenu |
|---|---|
| `semaine` | semaine de production |
| `equipe` | lettre de l'équipe |
| `code` | code de la recette (plat) |
| `plat` | nom du plat |
| `portions` | nombre de portions prévues |
| `sous_recette_cle` | clé de la sous-recette (chemin de la forme « … > … ») |
| `sous_recette` | nom de la sous-recette (préfixé « xxx : ») |
| `sous_recette_kg` | quantité prévue de la sous-recette (kg) |
| `cle` | clé de la ligne |
| `ingredient` | nom de l'ingrédient |
| `unite` | unité de l'ingrédient |
| `qte_tome` | quantité prévue dans le tome |

### Pertes (`pertes`)

`id`, `horodatage`, `semaine`, `equipe`, `niveau`, `code`, `sous_recette_cle`, `ingredient`, `quantite`,
`unite`, `cause` (texte libre), `par` (prénom).

## 3. Ce que nous reprenons

1. **Le plan de production hebdomadaire par équipe** comme source des listes de produits proposées
   (§7.5 : « listes filtrées selon la semaine et l'équipe »). C'est exactement ce qui manque à notre
   référentiel de produits, vide aujourd'hui.
2. **La navigation recette → sous-recette → ingrédient**, plus rapide qu'une recherche dans un catalogue.
3. **Les trois niveaux de perte** (plat fini en portions, sous-recette en kg, ingrédient dans son unité),
   qui correspondent à nos catégories `produit_fini` / `sous_recette` / `matiere_premiere`.
4. **Les quantités prévues** (`portions`, `sous_recette_kg`, `qte_tome`) : dénominateurs des taux de perte
   en Phase 4 (point 8 du cahier des charges).
5. Plus tard (Phase 6) : la saisie hors ligne avec file d'attente.

## 4. Ce que notre application ajoute

| Besoin du cahier des charges | Outil actuel | Notre application |
|---|---|---|
| Comptes et droits par équipe, contrôlés côté serveur | PIN commun, toutes équipes visibles | Comptes équipe, périmètres serveur |
| Causes standardisées par zone | Texte libre | Listes par zone / sous-zone |
| Zones hors cuisine (réception, stockage, conditionnement, plonge) | Non | Oui |
| Tares des gastros, conversions en kg | Non | Oui |
| Destinations et valorisation | Non | Oui |
| Historique des versions et audit | Annulation simple | Versions complètes + journal |
| Coûts (Phase 3) | Non | Prévu |

## 5. Intégration proposée (Phase 2)

Une **couche d'adaptation** (`src/modules/imports/tome/`) lit le plan de production au format ci-dessus et
l'importe dans nos tables avec prévisualisation, contrôle des doublons et des références inconnues,
et **conservation d'un instantané par semaine** (§16.3, §16.4) :

```
Google Sheet « prod » (ou export CSV/Excel)
   └─► adaptateur « tome » ─► prévisualisation + anomalies ─► validation admin
         ├─ products (recettes, sous-recettes, ingrédients)        référentiel
         ├─ recipe_components (recette ↔ sous-recette ↔ ingrédient) composition
         └─ week_product_plans (semaine × équipe × produit, qté prévue) plan de la semaine
```

Dans l'écran de déclaration, l'étape « Produit » proposera alors : les plats de l'équipe pour la semaine,
puis leurs sous-recettes et ingrédients ; avec une recherche complémentaire contrôlée pour les produits
d'une autre équipe (§7.5).

Les **pertes déjà saisies** dans l'outil actuel pourront être importées dans l'historique (niveau → catégorie,
cause libre → « Autres pertes » + commentaire), si l'entreprise le souhaite.

## 6. Points à éclaircir avant de développer

1. **Identifiants stables** : le plan contient-il les identifiants Melba des recettes, sous-recettes et
   ingrédients (champ `cle` ?) ou seulement les noms ? Sans identifiant, deux variantes proches ne peuvent
   pas être distinguées de façon fiable (§7.6).
2. **Accès aux données** : lecture directe du Google Sheet (lien partagé) ou export CSV/Excel par semaine ?
3. **Le tome Melba d'origine** : un exemplaire (une semaine) pour voir les champs disponibles en amont
   (codes, variantes, rendements, coûts).
4. **Avenir de l'outil actuel** : remplacé par notre application pour la saisie, ou utilisé en parallèle
   pendant une période de transition ? Faut-il reprendre l'historique de ses pertes ?
5. **Semaine** : le champ `semaine` suit-il la même numérotation (jeudi → mercredi, S46-2026) ?
