# Phase 5 — Valorisation et environnement

Objectif (cahier des charges §10, §20, §21, §23 et §26) : suivre ce que deviennent les pertes et leurs impacts.
Cela couvre :
- la valorisation : ventes, dons, réutilisations, compost ;
- le contrôle des poids des Alchimistes ;
- l'impact carbone des denrées perdues ;
- les rapports PDF.

## Décisions

| Date | Sujet | Décision |
|---|---|---|
| 12/11/2026 | Valorisation (§10.4, §20.1) | **Ce qui rapporte de l'argent est séparé de ce qui n'en rapporte pas.** Avec recette : ventes flash, Too Good To Go. Sans recette : personnel, association / don, ordures ménagères, Les Alchimistes. |
| 12/11/2026 | Poids des Alchimistes (§21) | **Fichier Excel ou CSV** fourni par Les Alchimistes, déposé dans l'application, avec un aperçu avant validation. |
| 12/11/2026 | Précision du CO2e (§20.2, §29 point 10) | **Calcul à partir de la recette Melba.** Chaque ingrédient du tome est rattaché à une famille alimentaire. Le facteur de chaque famille vient d'Agribalyse (ADEME) et doit être validé avant usage. L'impact d'un plat est la somme de ses ingrédients. Une perte hors liste reçoit une estimation par famille, signalée comme telle. |
| 12/11/2026 | Retours fournisseurs et avoirs | **Classés à part**, ni avec recette ni sans recette. |
| 12/11/2026 | Réutilisation dans une autre préparation | **À part, avec les retours fournisseurs.** |
| 12/11/2026 | Versions des facteurs CO2e | **Les anciennes versions sont conservées.** Un calcul fait avec une version de facteur n'est pas réécrit quand le facteur change (même principe que les coûts, §22). |
| 12/11/2026 | Semaine d'une collecte | **Calculée automatiquement à partir de la date de collecte**, avec le calendrier de production de l'application. La colonne « Correspondance aux semaines de prod » du fichier n'est plus à remplir à la main ; si elle est remplie et diffère, l'aperçu le signale. |
| 12/11/2026 | N° de poubelle | **Facultatif à la saisie en attendant**, obligatoire à nouveau dès que l'on obtient les n° des bacs collectés. Les n° sont visibles dans l'agenda en ligne des Alchimistes, jour par jour, mais pas dans leur fichier CSV ; demande envoyée aux Alchimistes pour les ajouter. Réglage dans Administration → Destinations (migration 0017). |
| 13/11/2026 | Étapes du cycle de vie retenues pour le CO2e | **Jusqu'à la livraison** : agriculture + transformation + emballage + transport d'Agribalyse. Ni la distribution en magasin, ni la cuisson chez le consommateur. |
| 12/11/2026 | Rapports PDF (§23) | Quatre rapports : hebdomadaire ; mensuel et annuel ; valorisation ; environnemental avec le rapprochement des Alchimistes. |

## Principes

- La valorisation **ne fait jamais disparaître** une quantité des pertes (§10.3). Un plat vendu, donné ou
  composté reste une perte. La valorisation dit seulement ce qu'il est devenu.
- Une **association** ou le **personnel** ne sont jamais comptés comme une recette (§10.4).
- Le poids mesuré par Les Alchimistes est une **mesure de contrôle**. Il n'est **jamais ajouté** aux pertes
  déclarées (§21).
- Un écart avec Les Alchimistes n'est pas présenté comme une erreur : les dates de collecte et les périmètres
  peuvent différer.
- Le CO2e porte sur la **production des denrées perdues**. Ce n'est pas un bilan carbone de l'entreprise (§20.3).
- Les données sont toujours séparées en trois : **mesurées**, **estimées**, **non couvertes**.
- **Aucun facteur d'émission n'est inventé.** Chaque facteur porte :
  - sa valeur et son unité ;
  - sa source et sa version ;
  - sa date de référence ;
  - sa famille ;
  - les hypothèses du calcul.
- Les mêmes droits qu'en Phase 4 s'appliquent : une équipe ne voit que ses pertes, et les euros sont réservés
  aux profils « indicateurs économiques ».

## Étapes proposées

| Étape | Contenu | État |
|---|---|---|
| 5.1 | **Valorisation** : onglet des statistiques en trois groupes (avec recette, sans recette, à part), détail par destination, suivi sur 12 semaines, exports Excel et CSV. | ✅ |
| 5.2 | **Import des poids des Alchimistes** : dépôt du fichier (CSV ou Excel), aperçu par semaine de production, conservation de chaque dépôt ; un fichier plus récent remplace les collectes de sa période. | ✅ |
| 5.3 | **Rapprochement** : onglet « Alchimistes » des statistiques, kg déclarés vers Les Alchimistes et kg pesés par semaine de production et par mois, écart en kg et en %, périodes non rapprochées, bacs de la semaine, exports. | ✅ |
| 5.4 | **Facteurs d'émission** : écran Administration → Facteurs d'émission (CO2e) ; proposition de 54 familles tirée d'Agribalyse 3.2, à valider ; versions conservées. | ✅ (validation des valeurs : à faire par vous) |
| 5.5 | **Rattachement des ingrédients Melba aux familles** : suggestions automatiques par mot-clé, validées par vous. On commence par les ingrédients les plus fréquents. | Après 5.4 |
| 5.6 | **Tableau de bord environnemental** : kg par catégorie et par devenir, CO2e mesuré, estimé ou non couvert, évolution. | Après 5.5 |
| 5.7 | **Rapports PDF** : hebdomadaire, mensuel et annuel, valorisation, environnemental avec Les Alchimistes. | À la fin |

## À confirmer

- **N° des bacs collectés** : réponse des Alchimistes attendue (colonne « Identifiant du contenant » dans leur
  export). D'ici là, le rapprochement se fait par semaine seulement.

## 5.1 — Onglet « Valorisation » ✅

Statistiques → Valorisation, avec la même période, les mêmes filtres et les mêmes droits que les autres onglets.
- Trois groupes :
  - **avec recette** : ventes (Too Good To Go, vente flash) ;
  - **sans recette** : ordures ménagères, compost (Les Alchimistes), don, personnel, autre ;
  - **à part** : réutilisation dans une autre préparation, retours fournisseurs.
- Pour chaque destination : kg, nombre de lignes et, pour les profils qui voient les euros, coût des produits
  et recette. Pour les ventes : part du coût récupérée et recette par kg.
- **Coût des produits d'une destination** : coût brut figé de la perte, réparti entre ses destinations au
  prorata des quantités affectées.
- Remarques affichées : lignes sans kg, emballages et moules (jamais en kg), lignes sans coût, ventes dont la
  recette reste à saisir.
- Suivi des 12 dernières semaines : kg par groupe (colonnes empilées) et recettes encaissées.
- Exports : tableau des destinations (totaux par groupe puis détail) et tableau des 12 semaines.
- Code : `src/domain/valorisation.ts` (calcul pur), `src/modules/statistiques/valorisation.ts`,
  `src/app/(app)/statistiques/valorisation/page.tsx`. Tests : `tests/unit/valorisation.test.ts`,
  `tests/integration/recovered.test.ts`.

## 5.2 — Import des pesées des Alchimistes ✅

Administration → Import de la semaine → « Pesées des Alchimistes ».
- Le fichier (CSV avec « ; », « , » ou tabulation, ou Excel : premier onglet) est lu **sur l'ordinateur** ;
  seules les collectes sont envoyées. Région, nom du client et nom de l'établissement ne sont jamais lus.
- Gardé pour chaque bac : date, poids net, type de contenant, n° du bac (si une colonne « Identifiant du
  contenant » apparaît), qualité, incident, type de matière, semaine écrite dans le fichier (pour contrôle).
- **Semaine de production** : tirée du calendrier de l'application à partir de la date (jeudi → mercredi). Si
  la colonne « Correspondance aux semaines de prod » donne une autre semaine, l'aperçu le signale.
- Aperçu : période, nombre de bacs, kg, livraisons ignorées, bacs et kg par semaine de production, points à
  vérifier (collecte à 0 kg, plusieurs contenants sur une ligne, type inconnu, semaine différente), et
  avertissement si des collectes sont déjà enregistrées sur la période.
- **Remplacement** : un nouveau dépôt remplace les collectes en vigueur entre sa première et sa dernière date.
  Les collectes remplacées restent en base (`replaced_by_import_id`) ; chaque dépôt est tracé dans le journal.
- Les poids ne s'ajoutent jamais aux pertes déclarées : ils serviront au rapprochement (5.3).
- Tables `alchimistes_imports` et `alchimistes_collections` (migration 0018). Code :
  `src/modules/imports/alchimistes/`, `src/app/(app)/admin/import/alchimistes-wizard.tsx`. Tests :
  `tests/unit/parse-alchimistes.test.ts`, `tests/integration/alchimistes.test.ts`.

## 5.3 — Rapprochement avec Les Alchimistes ✅

Statistiques → Alchimistes (profils qui comparent les équipes : production, direction, administration).
- **Toute l'entreprise** : les pesées ne se répartissent ni par zone ni par équipe ; les filtres ne s'appliquent
  pas.
- **Déclaré** : kg nets des lignes de destination « Les Alchimistes » (code `ALCHIMISTES`) des pertes non
  annulées, dernière version ; les lignes sans poids en kg sont comptées à part, jamais estimées.
- **Pesé** : collectes en vigueur (dernier fichier déposé pour chaque date).
- Par **semaine de production** (date de la perte d'un côté, date de collecte de l'autre) sur 12 semaines, et
  par **mois** sur 12 mois.
- **Écart** = pesé − déclaré, en kg et rapporté au poids pesé.
- État de chaque période : rapprochée ; pesées non déposées (aucun fichier ne couvre la période) ; aucune
  collecte ; rien de déclaré vers Les Alchimistes. Le total ne compte que les périodes comparables.
- Un écart n'est pas présenté comme une erreur (dates de collecte décalées, contenu des bacs non déclaré).
- Détail des bacs pesés de la semaine (date, n° si connu, poids, qualité, incident). Le rapprochement bac par bac
  attend les n° des bacs dans le fichier.
- Exports Excel et CSV : semaines et mois.
- Code : `src/domain/rapprochement.ts`, `src/modules/statistiques/alchimistes.ts`,
  `src/app/(app)/statistiques/alchimistes/page.tsx`. Tests : `tests/unit/rapprochement.test.ts`,
  `tests/integration/alchimistes.test.ts`.

## 5.4 — Facteurs d'émission ✅

Administration → Facteurs d'émission (CO2e).
- **Familles alimentaires** (`food_families`) et **facteurs versionnés** (`emission_factors`, migration 0019) :
  valeur en kg CO2e par kg, source, version, date des données, produit de référence (code AGB), valeurs par
  étape du cycle de vie, hypothèses, qui a proposé et validé, et quand.
- Statuts : proposé → validé ; une nouvelle version validée **remplace** l'ancienne (conservée, close à cette
  date) ; une proposition peut être refusée. Une seule version validée et une seule proposition par famille.
- **Aucun facteur n'est utilisé avant d'être validé.** Les calculs (étape 5.6) garderont la version utilisée.
- Bouton « Charger la proposition Agribalyse » : crée les familles manquantes et propose un facteur à celles
  qui n'en ont aucun (rien n'est validé automatiquement).
- « Proposer une autre valeur » : valeur saisie avec sa source et ses hypothèses (fiche fournisseur, autre
  produit Agribalyse…), à valider ensuite.

### Origine des valeurs proposées

- Jeu de données officiel « AGRIBALYSE – Détail par étape » de l'ADEME (data.ademe.fr, identifiant
  `agribalyse-31-detail-par-etape`, version **3.2**, mis à jour le 30/06/2026), téléchargé le 13/11/2026. Les
  jeux « AGRIBALYSE 4 » visibles sur le même site appartiennent à un département de tests de l'ADEME et ne sont
  pas utilisés.
- Indicateur « Changement climatique », par étape. **Valeur proposée = agriculture + transformation + emballage
  + transport** : l'impact du produit jusqu'à sa livraison (règle validée le 13/11/2026). La distribution en
  magasin et la consommation (cuisson à domicile) ne sont pas retenues ; elles restent affichées.
- Un **produit cru représentatif** par famille. Le DQR d'Agribalyse (qualité des données, 1 = très bonne,
  5 = très faible) est indiqué dans les hypothèses.
- Fichier généré : `src/modules/environnement/agribalyse-proposal.ts`.

| Catégorie | Famille | Produit Agribalyse retenu (code AGB) | kg CO2e / kg |
|---|---|---|---|
| Viandes | Bœuf | Boeuf, faux-filet, cru (6111) | 28,909 |
| Viandes | Veau | Veau, escalope, crue (6521) | 23,095 |
| Viandes | Agneau | Agneau, gigot, cru (21502) | 41,286 |
| Viandes | Porc | Porc, filet, maigre, cru (28201) | 6,52 |
| Viandes | Poulet | Poulet, filet, sans peau, cru (36017) | 5,535 |
| Viandes | Dinde | Dinde, escalope, crue (36304) | 5,535 |
| Viandes | Canard | Canard, viande, crue (36201) | 7,921 |
| Viandes | Jambon cuit | Jambon cuit, choix (28910) | 7,592 |
| Viandes | Lardons | Lardon nature, cru (28501) | 7,064 |
| Poissons et fruits de mer | Saumon | Saumon, cru, élevage (26036) | 5,51 |
| Poissons et fruits de mer | Poisson blanc (cabillaud, colin) | Cabillaud, cru (26043) | 12,039 |
| Poissons et fruits de mer | Thon | Thon, cru (26053) | 4,936 |
| Poissons et fruits de mer | Crevettes | Crevette, crue (10021) | 19,845 |
| Œufs et produits laitiers | Œufs | Oeuf, cru (22000) | 1,788 |
| Œufs et produits laitiers | Lait | Lait demi-écrémé, UHT (19041) | 1,258 |
| Œufs et produits laitiers | Crème | Crème de lait, 30% MG, semi-épaisse, UHT (19415) | 3,729 |
| Œufs et produits laitiers | Beurre | Beurre à 82% MG, doux (16400) | 7,901 |
| Œufs et produits laitiers | Fromage à pâte dure (emmental, comté, parmesan) | Emmental ou emmenthal (12115) | 6,172 |
| Œufs et produits laitiers | Mozzarella | Mozzarella au lait de vache (19590) | 4,671 |
| Œufs et produits laitiers | Yaourt et fromage blanc | Yaourt, lait fermenté ou spécialité laitière, nature (19593) | 1,851 |
| Féculents et légumineuses | Riz | Riz blanc, cru (9100) | 1,994 |
| Féculents et légumineuses | Pâtes sèches | Pâtes sèches standard, crues (9810) | 1,953 |
| Féculents et légumineuses | Semoule | Semoule de blé dur, crue (9610) | 1,736 |
| Féculents et légumineuses | Farine de blé | Farine de blé tendre ou froment T65 (9435) | 0,763 |
| Féculents et légumineuses | Pain | Pain, baguette, courante (7001) | 0,765 |
| Féculents et légumineuses | Pomme de terre | Pomme de terre, sans peau, crue (4008) | 0,76 |
| Féculents et légumineuses | Lentilles | Lentille, sèche (20504) | 0,515 |
| Féculents et légumineuses | Pois chiches | Pois chiche, sec (20516) | 0,832 |
| Légumes | Tomate | Tomate, crue (20047_1) | 0,644 |
| Légumes | Carotte | Carotte, crue (20009) | 0,345 |
| Légumes | Oignon | Oignon, cru (20034) | 0,369 |
| Légumes | Ail | Ail, cru (11000) | 0,282 |
| Légumes | Courgette | Courgette, pulpe et peau, crue (20020) | 0,443 |
| Légumes | Aubergine | Aubergine, crue (20053) | 0,443 |
| Légumes | Poivron | Poivron, vert, jaune ou rouge, cru (20041) | 0,604 |
| Légumes | Poireau | Poireau, cru (20039) | 0,509 |
| Légumes | Courge | Courge, crue (20139) | 0,53 |
| Légumes | Épinard | Épinard, cru (20059) | 0,366 |
| Légumes | Brocoli | Brocoli, cru (20057) | 0,835 |
| Légumes | Chou-fleur | Chou-fleur, cru (20016) | 0,605 |
| Légumes | Haricot vert | Haricot vert, cru (20061_1) | 0,379 |
| Légumes | Petits pois | Petits pois, crus (20072) | 0,674 |
| Légumes | Salade | Laitue, crue (20031) | 0,579 |
| Légumes | Concombre | Concombre, pulpe et peau, cru (20019) | 0,458 |
| Fruits | Pomme | Pomme, pulpe et peau, crue (13039) | 0,354 |
| Fruits | Banane | Banane, pulpe, crue (13005) | 0,742 |
| Fruits | Orange | Orange, pulpe, crue (13034) | 0,576 |
| Fruits | Citron | Citron, pulpe, cru (13009) | 0,6 |
| Fruits | Fraise | Fraise, crue (13014_1) | 0,51 |
| Matières grasses, sucre et autres | Huile d'olive | Huile d'olive vierge extra (17270) | 1,608 |
| Matières grasses, sucre et autres | Huile de tournesol | Huile de tournesol (17440) | 2,34 |
| Matières grasses, sucre et autres | Sucre | Sucre blanc (31016) | 0,725 |
| Matières grasses, sucre et autres | Chocolat noir | Chocolat noir à 40% de cacao minimum, à pâtisser, tablette (31085) | 15,418 |
| Matières grasses, sucre et autres | Lait de coco | Lait de coco ou Crème de coco (18041) | 0,642 |

## Fichier des Alchimistes (extrait reçu le 12/11/2026)

Une ligne par bac collecté. Colonnes :
- Date ;
- Type de rdv : « collect », ou « delivery » pour une livraison de bacs vides, toujours à 0 kg ;
- Région ;
- Nom du client ;
- Nom de l'établissement ;
- Nombre de contenant ;
- Type de contenant (« 120L biofiltre ») ;
- Poids net (contenu déchets), en kg avec une virgule décimale ;
- Qualite ;
- Incident de collecte ;
- Type de matière ;
- Correspondance aux semaines de prod (« S19 ») : remplie à la main jusqu'ici ; l'application calcule la semaine
  elle-même.

Pas de n° de bac dans le fichier. L'agenda en ligne les montre pour chaque jour : bacs collectés (n°, matière,
qualité, poids) et bacs vides déposés (n°).

Lecture prévue :
- seules les lignes « collect » sont gardées ; les livraisons sont ignorées et comptées dans l'aperçu ;
- le nom du client et de l'établissement ne sont pas enregistrés : c'est toujours La Brigade de Véro ;
- une ligne déjà importée n'est jamais comptée deux fois quand un fichier couvre une période déjà déposée.
  Une même date peut avoir plusieurs bacs de même poids : le fichier le plus récent remplace donc toutes les
  collectes de sa période.
