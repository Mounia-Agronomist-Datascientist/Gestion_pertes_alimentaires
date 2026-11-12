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
| 12/11/2026 | Retours fournisseurs et avoirs | **Classés à part**, ni avec recette ni sans recette. La réutilisation reste à classer. |
| 12/11/2026 | Versions des facteurs CO2e | **Les anciennes versions sont conservées.** Un calcul fait avec une version de facteur n'est pas réécrit quand le facteur change (même principe que les coûts, §22). |
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
| 5.1 | **Valorisation** : nouvel onglet des statistiques. Il présente deux blocs. **Avec recette** (ventes) : kg, nombre de ventes, recettes, recette par kg, coût brut des produits vendus et part récupérée. **Sans recette** (don, personnel, compost, ordures) : kg et coût des produits. Suivi des dons, des ventes et des réutilisations sur 12 semaines. Exports Excel et CSV. | À faire |
| 5.2 | **Import des poids des Alchimistes** : dépôt du fichier, aperçu, enregistrement des versions et de la source. Chaque bac collecté garde sa date, son poids, son type de bac, sa qualité et l'incident éventuel. | Extrait reçu |
| 5.3 | **Rapprochement** : par semaine de production ou par mois, kg déclarés vers Les Alchimistes comparés aux kg qu'ils ont mesurés. Écart en kg et en %, périodes non rapprochées. | Après 5.2 |
| 5.4 | **Facteurs d'émission** : écran des familles alimentaires et de leurs facteurs. Je préparerai une proposition tirée d'Agribalyse, que vous validerez. | À faire |
| 5.5 | **Rattachement des ingrédients Melba aux familles** : suggestions automatiques par mot-clé, validées par vous. On commence par les ingrédients les plus fréquents. | Après 5.4 |
| 5.6 | **Tableau de bord environnemental** : kg par catégorie et par devenir, CO2e mesuré, estimé ou non couvert, évolution. | Après 5.5 |
| 5.7 | **Rapports PDF** : hebdomadaire, mensuel et annuel, valorisation, environnemental avec Les Alchimistes. | À la fin |

## À confirmer

- **Réutilisation** dans une autre préparation et **retour fournisseur** : ils ne rapportent pas d'argent
  directement, mais ils évitent un achat ou peuvent donner lieu à un avoir. Faut-il les classer avec ou sans
  recette ? Ou à part ?
- **Réutilisation** dans une autre préparation : avec recette, sans recette, ou à part avec les retours
  fournisseurs ?
- **Semaine d'une collecte** : utiliser la colonne « Correspondance aux semaines de prod » quand elle est
  remplie, ou calculer la semaine à partir de la date de collecte ?
- **N° de poubelle** : le fichier des Alchimistes ne donne aucun n° de bac. Faut-il garder le n° obligatoire à
  la saisie pour un suivi interne, ou le rendre facultatif ?

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
- Correspondance aux semaines de prod (« S19 »).

Lecture prévue :
- seules les lignes « collect » sont gardées ; les livraisons sont ignorées et comptées dans l'aperçu ;
- le nom du client et de l'établissement ne sont pas enregistrés : c'est toujours La Brigade de Véro ;
- une ligne déjà importée n'est jamais comptée deux fois quand un fichier couvre une période déjà déposée.
  Une même date peut avoir plusieurs bacs de même poids : le fichier le plus récent remplace donc toutes les
  collectes de sa période.
