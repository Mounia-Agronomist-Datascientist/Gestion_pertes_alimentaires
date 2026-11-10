# Phase 3 — Calcul des coûts

Objectif (cahier des charges §18 et §10.4) : valoriser économiquement chaque perte, avec un coût brut détaillé
par composante et un coût net après recettes récupérées, figés sur la déclaration.

**Coût total brut = matières + main-d'œuvre + emballages + charges indirectes**
**Coût net = coût brut − recettes récupérées** (brut et net restent toujours consultables séparément).

## Décisions

| Date | Sujet | Décision |
|---|---|---|
| 10/11/2026 | Emballages d'un plat perdu | **Toujours** comptés pour tout plat perdu (barquette entière), quel que soit l'endroit de la perte |
| 10/11/2026 | Recettes Too Good To Go / vente flash | **Montant réellement encaissé**, saisi sur la ligne de destination (à la déclaration ou plus tard par un responsable) |
| §18.2 | Main-d'œuvre | Coût horaire moyen par zone saisi et daté, **non imputé** aux pertes tant que la méthode n'est pas définie |
| §18.4 | Charges indirectes | Version ultérieure : composante prévue, vide |

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 3.1 | Référentiel des emballages et consommables : code, nom, type, unité, fournisseur, statut, **coût unitaire daté** (versions) | ✅ Administration → Emballages et consommables |
| 3.2 | Emballages consommés par portion : plats et petits-déjeuners (ex. 1 barquette + 1 film + 1 étiquette) | ✅ Quantité par plat / par petit-déjeuner ; coût d'une portion à une date (`portionPackagingCost`) |
| 3.3 | Coût Melba d'un plat séparé en **matières** et **moules / plats à gratin** (déjà inclus dans Melba : jamais comptés deux fois) | ✅ |
| 3.4 | Instantané complet par déclaration : matières, emballages, main-d'œuvre (non active), indirect (vide), méthode, versions, date de calcul ; coût brut | ✅ Migration `0012` |
| 3.5 | Recettes récupérées : montant encaissé par ligne de vente ; coût net | ✅ Migration `0013` |
| 3.6 | Référentiel main-d'œuvre par zone (taux horaires datés), sans imputation | ✅ Administration → Main-d'œuvre (migration `0014`) |
| 3.7 | Écran « Coûts » : brut, récupéré, net par semaine ; répartition matières / main-d'œuvre / emballages / indirect en montants et pourcentages | ✅ Page « Coûts des pertes » |

## Règles appliquées

- Un coût n'est **jamais inventé** : sans coût unitaire saisi, la composante reste vide et la perte l'indique.
- Les coûts sont **figés à la saisie** (§18.5) : un nouveau prix ne recalcule pas une perte passée ; une correction
  de la perte recalcule avec les prix en vigueur à la date de la perte, et la version précédente reste dans
  l'historique.
- Pas de double comptage (§18.1) : le coût Melba d'un plat inclut déjà ses moules et plats à gratin ; ils sont
  isolés dans la composante « emballages » au lieu d'être ajoutés une seconde fois.

## Emballages (3.1, 3.2)

Administration → **Emballages et consommables** :
- fiche : code interne (en majuscules, ne change plus), nom, type (barquette, film, étiquette, moule à gratin,
  plat, gastro, autre), unité, fournisseur facultatif, actif / désactivé ;
- **coût unitaire daté** : comme les tares, une nouvelle valeur s'applique à partir d'une date et clôture la
  précédente la veille ; une valeur pas encore entrée en vigueur peut être corrigée à la même date ; une valeur
  déjà appliquée n'est jamais réécrite ;
- **quantité par portion** (par plat, par petit-déjeuner) : ce qui est ajouté au coût de chaque plat perdu ;
- en tête de page : coût des emballages d'un plat et d'un petit-déjeuner aujourd'hui, avec un avertissement si
  un emballage compté n'a pas de coût.

Le référentiel est **vide au départ** : aucun coût n'est inventé. Les encas (produits achetés emballés) n'ont pas
d'emballage ajouté.

Vérifié : 4 tests d'intégration + 1 test unitaire ; création, coût et quantité par plat faits dans le navigateur
(mobile).

## Coût brut d'une perte (3.3, 3.4)

| Produit perdu | Matières | Emballages |
|---|---|---|
| Plat (barquette) | coût Melba de la portion **moins** les moules et plats à gratin qu'il contient | ces moules + emballages du référentiel « par plat », × nombre de portions |
| Petit-déjeuner | idem | idem avec les emballages « par petit-déjeuner » |
| Encas | coût Melba (produit acheté) | aucun ajout |
| Sous-recette, ingrédient | leur coût Melba | aucun |
| Moule ou plat à gratin | — | son coût Melba |

- **Portions** : nombre de barquettes comptées, ou poids net ÷ poids d'une portion pour un plat pesé.
- Coût compté : à l'unité pour une quantité comptée (coût d'une portion, le plus exact), sinon au kg.
- Moules inclus dans une sous-recette : isolés au prorata de la quantité de sous-recette utilisée.
- **Emballages du référentiel aux prix en vigueur à la date de la perte** (comme les tares). Le récapitulatif de
  la saisie montre une estimation aux prix du jour ; s'il manque un prix à la date de la perte, le détail le
  signale (« montant des emballages incomplet »).
- **Instantané enregistré** : matières, emballages, main-d'œuvre (vide, non imputée), indirect (vide), **coût
  brut**, méthode (`melba-semaine+emballages-v1`), date de calcul, import du tome, et détail (portions, moules
  par portion, emballages et prix appliqués). Une correction recalcule et la version précédente reste dans
  l'historique.

Exemple S45, Choutiflette VI03 (1,46 € dont 0,07 € de plat à gratin), 4 barquettes, emballages 0,12 € + 0,03 € :
matières 4 × 1,39 = 5,56 € ; emballages 4 × (0,07 + 0,15) = 0,88 € ; coût brut 6,44 €.

Vérifié : 4 tests unitaires + 1 test d'intégration ; dans le navigateur, déclaration VI03 avec récapitulatif et
détail du coût.

## Recettes récupérées et coût net (3.5)

- Sur une ligne de destination **de vente** (destinations « peut rapporter une recette » : Too Good To Go, vente
  flash), on indique le **montant réellement encaissé** : au récapitulatif de la déclaration, ou plus tard depuis le
  détail de la perte (« Saisir la recette encaissée »), avec les mêmes droits qu'une correction.
- Un montant sur une autre destination (compost, don, personnel…) est refusé : le don et le repas du personnel ne
  sont jamais des recettes (§10.4).
- La déclaration garde **recettes encaissées** (somme des lignes) et **coût net = coût brut − recettes** ; le coût
  brut ne change pas. Compléter une recette crée une nouvelle version (motif « Recette encaissée »), l'ancienne
  reste dans l'historique.

Vérifié : 3 tests d'intégration ; dans le navigateur, 10 barquettes de VI01 (6 Too Good To Go, 4 compost) avec
4,50 € encaissés au récapitulatif, puis montant porté à 5,00 € depuis le détail (coût net 8,30 €).

## Main-d'œuvre (3.6)

Administration → **Main-d'œuvre** : coût horaire moyen par zone, daté (même règle que les emballages : nouvelle
valeur à partir d'une date, correction possible avant son entrée en vigueur, jamais de réécriture d'une valeur
appliquée ; règle commune `src/domain/versions-datees.ts`). **Rien n'est imputé aux pertes** : la composante
main-d'œuvre reste vide tant que la méthode d'affectation n'est pas définie (§18.2).

## Écran « Coûts des pertes » (3.7)

Accessible depuis l'accueil aux rôles ayant les indicateurs économiques (administration, responsable production,
direction) :
- semaine par semaine : **coût brut**, **recettes encaissées**, **coût net** ;
- nombre de pertes, kg, pertes valorisées ; pertes **sans coût connu** comptées à part (jamais estimées) ;
  emballages incomplets signalés ;
- **répartition du coût brut** : barre empilée (matières, main-d'œuvre, emballages, charges indirectes, couleurs
  fixes validées pour le daltonisme) et tableau des montants et pourcentages ;
- tableaux **par équipe** et **par zone** (brut, recettes, net).

Le net de la synthèse est toujours « brut − recettes » ; une perte saisie avant le coût brut (Phase 2) compte pour
son coût matière.

**Phase 3 terminée** (10/11/2026). Restent à définir avec l'entreprise : la méthode d'imputation de la
main-d'œuvre et les charges indirectes (§18.2, §18.4).
