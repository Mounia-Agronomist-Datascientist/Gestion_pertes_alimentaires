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
| 5.3 | **Rapprochement** : par semaine de production ou par mois, kg déclarés vers Les Alchimistes comparés aux kg qu'ils ont mesurés. Écart en kg et en %, périodes non rapprochées. | Après 5.2 |
| 5.4 | **Facteurs d'émission** : écran des familles alimentaires et de leurs facteurs. Je préparerai une proposition tirée d'Agribalyse, que vous validerez. | À faire |
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
