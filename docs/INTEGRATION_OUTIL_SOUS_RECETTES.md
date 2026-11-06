# Intégration de l'outil « Pertes Production » (sous-recettes par équipe)

Analyse du 06/11/2026 de l'outil réalisé par un collègue (cahier des charges §17), à partir de son code
public (`pertes-productions.netlify.app`), du Google Sheet « Plan de production » (lu en lecture seule)
et d'un exemple de tome Melba (S48-2026).

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

## 5. Les deux sources réelles (analysées le 06/11/2026, en lecture seule)

Décision du 06/11/2026 : **notre application remplace l'outil « Pertes Production »**. Elle doit donc lire
directement les deux sources qu'il combinait.

### 5.1 Google Sheet « Plan de production » (affectation des plats aux équipes)

Fichier d'un autre service : **lecture seule, jamais modifié par l'application.**

- Un onglet par semaine : `S01` … `S52` pour 2026, `S2551`, `S2552` pour fin 2025 (format `S` + `AA` + `SS`
  quand l'année n'est pas l'année en cours).
- En haut de l'onglet, tableaux de charge par équipe (nombre de références, découpes, fours, barquettes…).
- Bloc **« Référence PLATS »** (puis un second bloc pour les petits-déjeuners `PJ`) : une ligne par
  **groupe de codes** traité par une même équipe, par exemple `VI03/VI09/PR01/PR04/QD03/FB06` → équipe `A`,
  815 barquettes. Colonnes utiles : codes (A), cuisson longue (C), plat à gratin (D), découpes (E, F),
  nombre de barquettes (O), **équipe (P)**.
- Bloc « coller ici » : nombre de barquettes **par code** (ex. `VI01` → 2 826).
- L'équipe (colonne P) n'est renseignée qu'une fois le planning fait : la semaine suivante peut être vide.

### 5.2 Le « tome » Melba (composition des recettes)

Impression « Imprimer les recettes » de Melba pour une semaine (exemple reçu : S48-2026, 123 pages,
85 recettes, 106 sous-recettes distinctes).

- Chaque recette : `2026 S48_VI01-Nom du plat`, nombre de recettes et poids d'une portion, allergènes,
  composition en sous-recettes avec quantité par portion.
- Chaque sous-recette : quantité à produire, ingrédients avec quantités et unités, **« Recette totale »
  (brut) et « Poids net » (après cuisson)** → rendement réel ; consignes de cuisson ; commentaires
  d'ajustement des pertes semaine après semaine.
- Les unités indiquent souvent le **poids unitaire** : « 2.00 Pot (125 g) », « 13.00 pièce (30 g) »,
  « 1.00 sachet (30 g) » → source fiable pour la conversion en kg (§8.2), sans rien inventer.
- Les emballages apparaissent comme ingrédients (« MOULE ROND INDIVIDUEL BIODEG 180mL »).
- Programmes (préfixes) variables selon les semaines : `VI`, `PO`, `VG`, `PR`, `LC`, `CA`, `FB`, `QD`,
  `PJ` (petits-déjeuners), `EN` (encas, suffixés `_EQ`, `_FB`, `_LC`, `_MN`).
- **Absents du PDF : identifiants Melba, coûts.**

### 5.3 Conséquences pour le modèle de données

1. Les codes `VI01`, `PO03`… sont des **emplacements de la semaine**, pas des identifiants : `VI01` de S46
   et `VI01` de S47 sont deux plats différents. Une recette de la semaine est identifiée par
   (semaine, code) ; son lien avec une recette Melba stable reste à établir (identifiant Melba).
2. Un groupe de codes = un même plat décliné dans plusieurs programmes, produit par une seule équipe.
3. Une même sous-recette sert à plusieurs plats (ex. « Légume vapeur : Brocolis ROK » dans 6 plats) :
   conforme au §13.1, la sous-recette n'appartient ni à une recette ni à une équipe.
4. Les quantités prévues (barquettes par code, kg par sous-recette, quantités d'ingrédients) servent de
   **dénominateurs** pour les taux de perte (Phase 4).
5. « Recette totale » / « Poids net » donnent le **rendement** utile au calcul des coûts (Phase 3).

## 6. Intégration proposée (Phase 2)

```
Google Sheet « Plan de production » (lecture seule)     Tome Melba de la semaine
   onglet Sxx : codes → équipe, barquettes                 recettes → sous-recettes → ingrédients
            │                                                          │
            └──────────────► adaptateurs d'import ◄──────────────────┘
                              prévisualisation + anomalies + validation admin
                                         │
          ┌──────────────────────────────┼────────────────────────────────┐
     week_recipes                   recipe_components                products (sous-recettes,
 (semaine, code, nom, équipe,   (recette ↔ sous-recette ↔         ingrédients, emballages,
  portions, barquettes)          ingrédient, quantités)            poids unitaire, rendement)
```

- Instantané conservé par semaine ; un nouvel import n'écrase jamais une semaine déjà validée sans trace.
- Codes du plan absents du tome (ou l'inverse), équipe manquante, doublons → signalés dans le rapport.
- Étape « Produit » de la déclaration : plats de l'équipe pour la semaine → sous-recettes → ingrédients,
  plus une recherche complémentaire contrôlée.

## 7. Points encore ouverts

1. **Format du tome** : le PDF se lit, mais sa mise en page peut changer. Melba propose-t-il le même
   contenu en **export Excel/CSV**, ou l'accès à son **API** (§16.1) ? C'est la solution la plus fiable.
2. **Identifiants Melba** des recettes, sous-recettes et ingrédients : présents dans un export ou l'API ?
3. **Code de l'outil du collègue** (Apps Script) : il construisait déjà la table « recette → sous-recette →
   ingrédient » ; sa logique de lecture du tome pourrait être reprise plutôt que réécrite.
4. **Calendrier d'import** : à quel moment de la semaine le plan (colonne équipe) et le tome sont-ils définitifs ?
5. **Données d'exemple pour les tests** : peut-on conserver dans le dépôt (privé) un extrait anonymisé
   d'une semaine pour tester l'import ?
