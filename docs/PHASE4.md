# Phase 4 — Tableaux de bord et statistiques

Objectif (cahier des charges §19 et §26) : rendre les données exploitables — statistiques par semaine, mois,
année ; analyses par zone, sous-zone, équipe, recette, sous-recette, cause et destination ; comparaison des
semaines ; ratios de pertes ; graphiques économiques.

## Décisions

| Date | Sujet | Décision |
|---|---|---|
| 10/11/2026 | Dénominateur des ratios (§29 point 8) | **Prévu et réel côte à côte** : barquettes prévues du plan de production importé, et barquettes réellement produites (« Décompte barquettes ») dès qu'elles sont disponibles |
| 10/11/2026 | Kg produits | Barquettes × poids d'une portion du tome Melba (plats et petits-déjeuners) ; pas de ratio en kg pour les sous-recettes et matières |
| 10/11/2026 | Exports (§23) | Excel et CSV de chaque tableau de bord, avec ses filtres, dans cette phase ; rapports PDF plus tard |

## Principes

- Mêmes droits que l'historique : une **équipe ne voit que ses propres chiffres** (et les statistiques globales
  simplifiées, droit `stats.global`), un responsable de zone ses zones ; seuls les profils `stats.compare_teams`
  comparent les équipes, et seuls les profils `indicators.read` voient les **euros**.
- Les déclarations **annulées** ne comptent jamais ; une perte corrigée compte pour sa dernière version.
- Les coûts affichés sont ceux **figés sur chaque perte** (§18.5) : aucune statistique n'est recalculée avec de
  nouveaux prix.
- Les quantités sont en **kg nets** ; les pertes non converties en kg sont comptées à part et signalées, jamais
  estimées. Les kg alimentaires ne sont **jamais mélangés** avec les unités d'emballage (§19.7).
- Un **ratio n'est affiché que si son dénominateur existe**, avec ce dénominateur écrit à côté (§19.7).
- Graphiques en SVG dessinés par l'application (comme la barre de « Coûts des pertes ») : pas de bibliothèque
  supplémentaire, couleurs validées pour le daltonisme, chaque graphique accompagné de son tableau.

## Étapes proposées

| Étape | Contenu | État |
|---|---|---|
| 4.1 | Moteur de statistiques : agrégats sur une période (semaine, mois, année, dates libres) avec filtres (zone, sous-zone, équipe, catégorie de produit, cause, destination), selon les droits | ✅ Règle R14 |
| 4.2 | **Tableau de bord général** (§19.1) : kg, coût, quantités détruite / compostée / donnée / vendue / réutilisée, évolution par rapport à la période précédente, barre de filtres | ✅ Page « Statistiques » |
| 4.3 | **Analyses par zone, sous-zone et équipe** (§19.2, §19.3) : quantités, coûts, causes principales, produits, destinations, évolution ; comparaison des équipes pour les profils autorisés | ✅ Onglets « Par zone » et « Par équipe » |
| 4.4 | **Recettes, sous-recettes, causes, destinations** (§19.4, §19.5) : classements en quantité, en coût et en nombre d'événements ; une sous-recette utilisée dans plusieurs plats est comptée une seule fois | ✅ Onglets « Produits » et « Causes et destinations » |
| 4.5 | **Comparaison des semaines** (§19.6) : courbe semaine par semaine, moyenne des dernières semaines, mois, année, même semaine l'année précédente si elle existe | ✅ Onglet « Évolution » |
| 4.6 | **Ratios de pertes** (§19.7) : barquettes perdues / barquettes produites, kg perdus / kg produits, prévu et réel côte à côte, avec dénominateur affiché | ⏳ |
| 4.7 | **Graphiques économiques** : évolution du coût brut et net, répartition par composante dans le temps (complète « Coûts des pertes ») | ⏳ |
| 4.8 | **Exports Excel et CSV** de chaque tableau de bord, avec ses filtres | ⏳ |

## Reste à préciser pour l'étape 4.6

Le **mode d'accès au « Décompte barquettes »** (barquettes réellement produites) : import d'un fichier exporté
chaque semaine, comme le plan, ou lecture du Google Sheet. En attendant, le ratio « réel » s'affiche
« non disponible » et seul le ratio « prévu » est calculé.

## Moteur de statistiques (4.1)

- `src/domain/periodes.ts` : semaine, mois, année, période libre ; lecture dans l'adresse ; période précédente.
- `src/modules/statistiques/facts.ts` : lecture des pertes d'une période avec les filtres, dans le périmètre du
  compte (règle R14) ; euros transmis seulement aux profils « indicateurs économiques ».
- `src/domain/statistiques.ts` : agrégats (kg alimentaires, pertes non converties, barquettes, emballages par
  unité, kg par type de destination, coûts brut / recettes / net), regroupements et classements (kg, coût,
  nombre d'événements), évolution.

Vérifié : 8 tests unitaires + 5 tests d'intégration (dernière version et ses destinations, annulées exclues,
périmètre d'une équipe sans euros, direction sur toute l'entreprise, mois / année / période / filtres, semaine
précédente).

## Tableau de bord général (4.2)

Page **Statistiques**, accessible depuis l'accueil à tous les profils qui ont les statistiques (équipes,
responsables de zone, production, direction, administration) :
- période : semaine (par défaut la semaine en cours), mois, année ou dates libres ; boutons période précédente et
  suivante ;
- filtres : zone, équipe (profils qui comparent les équipes seulement), type de produit ; ils restent dans
  l'adresse de la page (partageable, retour arrière du navigateur) ;
- indicateurs : kg de pertes alimentaires, coût brut et coût net (profils « indicateurs économiques »),
  barquettes perdues, nombre de déclarations ; chacun avec son **évolution** par rapport à la période précédente
  (flèche, écart et pourcentage écrits) ;
- **devenir des pertes** : kg détruits, compostés, donnés, vendus, réutilisés (puis repas du personnel, retour
  fournisseur, autre s'il y en a), en barres d'une seule couleur avec valeur et part écrites ;
- notes : pertes sans poids en kg, emballages et moules comptés à part (par unité), pertes sans coût connu ;
- une équipe voit « vos pertes uniquement », un responsable de zone ses zones.

Le pourcentage de pertes par rapport à la production arrivera avec les ratios (étape 4.6).

Vérifié : 1 test d'intégration (période précédente, euros selon le profil, périmètre d'une équipe) ; page
vérifiée dans le navigateur (mobile) : semaine S46, navigation, filtre mois + équipe.

## Analyses par zone, sous-zone et équipe (4.3)

Onglets **Vue générale / Par zone / Par équipe** en haut des statistiques (même période et mêmes filtres) :
- **Par zone** : kg de pertes alimentaires et coût brut de chaque zone, avec le nombre de pertes, le coût net et
  l'évolution par rapport à la période précédente ; un clic ouvre le détail de la zone ;
- **Par équipe** (production, direction, administration) : la même comparaison entre équipes ; les pertes sans
  équipe (attribuées à une zone) sont signalées à part. Un compte équipe voit l'onglet **Mon équipe** : le détail
  de sa seule équipe, jamais celui des autres (§19.3) ;
- **Détail** d'une zone ou d'une équipe : indicateurs avec évolution, **causes principales**, **produits
  concernés** (code Melba et nom), **par sous-zone**, **par équipe** (détail d'une zone, profils qui comparent),
  **devenir des pertes**, et **semaine après semaine** (kg des 8 dernières semaines de production jusqu'à la fin de
  la période).

Barres d'une seule couleur avec valeur, part et détail écrits ; sur téléphone la barre passe sous le libellé.

Vérifié : 3 tests d'intégration (comparaison réservée, détail d'une zone, équipe limitée à son détail,
dernières semaines) ; pages vérifiées dans le navigateur (mobile) : par équipe S46, par zone S45, détail Cuisine.

## Produits, causes et destinations (4.4)

Onglet **Produits** (§19.4) :
- familles : plats, sous-recettes, matières premières, encas / emballages / moules, tous ;
- classement **en kg**, **en coût** (profils qui voient les euros) ou **en nombre de pertes** ; 20 premiers ;
- pour chaque produit : pertes, kg, barquettes, coût, **cause principale** (et sa part) ;
- un plat est suivi par sa **formule** (code Melba) : sur plusieurs semaines, les plats différents d'une même
  formule sont regroupés et leurs noms listés ;
- une sous-recette, sans code Melba, est suivie par son **nom normalisé** (identification au mieux d'une semaine
  à l'autre), comptée **une seule fois** et accompagnée des **plats qui l'utilisent** dans leur composition.

Onglet **Causes et destinations** (§19.5) :
- causes classées en kg, en coût ou en nombre de pertes, avec la zone où elles pèsent le plus ;
- kg et nombre de pertes **par destination** (Les Alchimistes, Too Good To Go, don…) ; une perte répartie entre
  plusieurs destinations compte dans chacune.

Les pertes par quantité produite (§19.4) arriveront avec les ratios (étape 4.6).

Vérifié : 1 test unitaire + 2 tests d'intégration (formule, sous-recette partagée et ses plats, compte équipe
sans euros, causes et destinations) ; pages vérifiées dans le navigateur (mobile) avec un compte équipe.

## Comparaison des semaines (4.5)

Onglet **Évolution** (§19.6), toujours à partir d'une semaine (celle choisie, sinon la semaine en cours) :
- **comparaison de la semaine** : semaine choisie, semaine précédente, moyenne des 4 semaines d'avant, même
  semaine l'année précédente (si des pertes y sont enregistrées) ; kg, barquettes perdues, nombre de pertes, coût
  brut (profils qui voient les euros), **barquettes prévues** et **kg pour 1 000 barquettes prévues** ;
- **à volume égal** : le volume est celui du **plan de production importé** de chaque semaine (barquettes prévues,
  toutes équipes, ou celles de l'équipe filtrée / du compte équipe). Sans plan importé, le chiffre n'est pas
  calculé (tiret) ; la moyenne à volume égal ne compte que les semaines qui ont un plan ;
- **dernières semaines** : histogramme des 12 dernières semaines, en kg ou à volume égal, valeurs dans un
  tableau dépliable ;
- **évolution mensuelle** (date réelle de la perte, 12 mois au plus à partir de la première perte) et
  **annuelle** (années de production), chacune comparée à la précédente.

Volume prévu : `src/modules/statistiques/production.ts` (barquettes du plan × poids d'une portion Melba pour les
kg, décision du 10/11/2026), réutilisé pour les ratios de l'étape 4.6.

Vérifié : 3 tests d'intégration (volume prévu total et par équipe, comparaison et moyenne, mois et années) ;
page vérifiée dans le navigateur (mobile, compte équipe : volume de l'équipe D).
