# Bilan de l'application Pertes — où en est-on ?

Version du 23/11/2026 · Fiche de repère, à relire quand on s'y perd. Le détail des règles est dans
docs/REGLES_METIER.md, le journal daté dans docs/SUIVI.md.

## En bref

- **L'application est prête pour l'essai pilote.** Toutes les phases prévues (déclarations, import Melba, coûts,
  statistiques, valorisation, environnement, alertes, saisie sans réseau) sont faites et testées (485 tests
  automatiques et 6 parcours complets dans Chrome).
- **Elle n'est pas encore à jour en ligne** : les crédits Netlify sont épuisés jusqu'au **8 décembre 2026**. Toutes
  les nouveautés depuis le 13/11 tournent seulement en local.
- **Ce qui reste surtout** : la mise en ligne, l'essai avec les équipes, et quelques décisions métier (en fin de fiche).

## Qui fait quoi

| Profil | Ce qu'il voit et fait |
|---|---|
| **Compte équipe** (A Bleue … H Turquoise) | Déclare ses pertes (Cuisine/production par défaut), corrige les siennes dans le délai, voit « Mon équipe » |
| **Responsable de zone** | Déclare dans ses zones (les autres sont grisées), corrige sans délai, statistiques de ses zones |
| **Responsable de production** | Toutes les zones, statistiques complètes, journal d'audit |
| **Direction** | Statistiques et rapports |
| **Administrateur** | Tout, plus l'Administration (imports, référentiels, comptes, réglages) |

Les zones d'un compte se cochent dans Administration → Comptes. Aucun prénom dans l'application : comptes nommés
par fonction.

## Déclarer une perte — le parcours

Accueil → **Déclarer une perte**. Une question par écran ; « Modifier » au récapitulatif pour revenir sur une étape.

1. **Où ?** La zone (numérotée dans le sens de la marche en avant), puis le poste.
2. **Quelle équipe ?** Seulement pour un compte sans équipe, en Cuisine/production.
3. **Quel produit ?** Recherche par lettres ou par code (VI01). « Produit absent de la liste » juste sous la recherche.
4. **Quelle quantité ?** La façon de mesurer dépend de la zone (tableau ci-dessous).
5. **N° de lot et DLC** (Réception, Stockage seulement, facultatif).
6. **Pourquoi ?** La cause, propre à la zone. Aucune ne convient : « Autres causes » + commentaire, ou « Proposer une
   nouvelle cause ».
7. **Où part la perte ?** Une destination, ou « Répartir entre plusieurs destinations ».
8. **Vérifier et valider.** Date et heure de la perte, commentaire, coût estimé, n° de poubelle des Alchimistes.

### Ce qui change selon la zone

| Zone | Produits proposés | Façons de mesurer | Particularités |
|---|---|---|---|
| **1. Réception** | Matières des semaines S-1, S et S+1 (tome et bons de commande), avec fournisseur et colis ; « Tous les encas » | 1. Comptage en colis, sachets ou unités · 2. Pesée à la balance · 3. Estimation — en kg | Lots, DLC, photos ; « Retour fournisseur » compté à part, pas de « Réutilisation » |
| **2. Stockage** | Matières de la semaine rangées dans le lieu choisi d'abord, les autres à part ; encas selon le lieu (yaourts et fromages au Local encas frais, le reste au Stockage sec – ENCAS) | Comme la Réception, en kg ; colis du fournisseur (poids corrigeable, « Autre colis ») | Lots, DLC, photos |
| **3. Cuisine / Production** (4 postes) | Plats de l'équipe → sous-recettes → ingrédients (tome de la semaine) | 1. Nombre de pièces · 2. Pesée à la balance : « Pesé dans des gastros » (tare déduite, échelle possible) ou « Poids net » · 3. Estimation | Équipe obligatoire ; consommables comptés en pièces |
| **4. Conditionnement** | Poste « Barquettes jetées » : les plats de la semaine ; poste « Encas jetés » : les encas de la semaine puis tous les encas par famille | 1. Nombre de barquettes (plat, au poids de sa barquette) ou d'encas (au poids d'un encas) · 2. Pesée à la balance · 3. Estimation ; kg seulement, sans gastros | — |
| **5. Plonge** | Liste des produits | kg ou pièces | — |

**Produit absent de la liste** : nom, type, prix d'achat facultatif (la perte est alors chiffrée). En Réception et
Stockage : seulement matière première ou encas, fournisseur facultatif (connu ou tapé) ; l'article est ajouté
aussitôt à la liste, « à valider » par l'administration.

**N° de lot et DLC** (Réception, Stockage) : photos de l'étiquette (4 au plus, gardées 3 mois), une ligne par lot ou
DLC avec sa quantité, « Mettre le reste », total = quantité de la perte. DLC au clavier numérique (« 251126 »).
Lot et DLC tapés à la main pour l'instant (lecture automatique possible plus tard).

### Causes par zone (base locale au 23/11)

| Zone | Causes |
|---|---|
| Réception | Produit arrivé cassé / ouvert / dessouvidé · Cassé / ouvert pendant la manipulation · Problème de qualité (abîmé, pourri…) · Étiquetage ou emballage non conforme · Corps étranger / contamination |
| Stockage | 1. Problème de DLC · 2. Problème de qualité · 3. Retour non conforme · 4. Surstock · 5. Retour non utilisable · 6. Rupture du froid (panne de chambre) · 7. Nuisibles · 8. Chute / écrasement en manutention |
| Cuisine / Production (mêmes causes aux 4 postes) | 1. Non-conformité POIDS · 2. Non-conformité CUISSON · 3. Non-conformité INGRÉDIENT · 4. Surplus non utilisable · 5. Chute de gastro · 6. Oubli de gastro sur une échelle · 7. Non-protection des gastros · 8. Contamination / corps étranger · 9. Panne / casse machine · 10. Erreur de déboîtage / préparation · 11. Erreur sur les chiffres prévisionnels |
| Conditionnement | Non-conformité qualité · Surplus de production · Chute de produit · Doseuse · Défaut de scellage · Barquettes de test d'oxygène · Erreur d'étiquetage · Poids non conforme · Défaut d'aspect · Barquette abîmée · Erreur de production · Barquette remise au personnel puis jetée · Fond de gastro · Panne d'équipement · Réglage / démarrage de la ligne |
| Plonge | Fond de gastro |
| Partout | **Autres causes** (avec commentaire) |

Chaque cause a une **famille de cause racine** (organisation, équipement, fournisseur, conservation, hygiène,
surproduction, inhérente, autre) et un caractère **évitable / inévitable / à évaluer**, proposés puis validés dans
Administration → Causes. Les équipes ne voient rien de plus : ils servent aux statistiques.

### Destinations

Les Alchimistes – compost (n° de poubelle, facultatif) · Association / don · Personnel · Ordures ménagères ·
Réutilisation dans une autre préparation (pas en Réception) · Retour fournisseur (Réception seulement) · Autre
destination (commentaire obligatoire). **Too Good To Go, vente flash et Linkee** ne se déclarent pas : ils viennent
des fichiers de l'entreprise déposés par l'administration.

## Les autres façons de saisir

- **Plusieurs pertes d'un coup** (Accueil → Déclarer plusieurs pertes) : liste préparée sur la tablette, validée
  en une fois (tout ou rien). Lots possibles, pas de photos.
- **Sans réseau** : la perte est gardée sur la tablette et part toute seule au retour du réseau (bandeau orange,
  page « Pertes en attente »). L'application s'ouvre même sans réseau si elle a été installée.
- **Corriger ou annuler** (Pertes déclarées → la perte) : nouvelle version avec motif obligatoire, l'ancienne est
  gardée. Équipes : déclarer jusqu'à 7 jours après la perte, corriger jusqu'à une semaine après la fin de la semaine
  de production. Responsables : sans délai.

## Les alertes

- **« Saisie incomplète »** : une équipe sans déclaration un jour de production compte 150 kg estimés pour la plage
  (jeudi-vendredi ou lundi-mercredi) ; l'alerte s'efface quand les pertes sont saisies, ou se lève avec un motif.
- **Alertes d'analyse** (calculées la nuit, à l'accueil, « Vu » par compte) : pertes inhabituelles (+50 % sur la
  moyenne de 4 semaines, 5 kg minimum, à volume égal), causes récurrentes (même cause en tête 3 semaines de suite),
  tendances (hausse / stable / baisse). Seuils réglables. **Mise en service prévue après l'essai des équipes.**

## Les statistiques

Un seul bouton « Statistiques » à l'accueil (la synthèse de la semaine est un onglet). Période (semaine, mois, année,
libre) et filtres en haut ; exports Excel et CSV sur chaque onglet ; impression A4. Une équipe voit la part de ses
pertes dans sa zone puis dans l'entreprise, un responsable de zone la part de sa zone dans l'entreprise, à la place
des pertes par zone.

| Onglet | Ce qu'on y lit |
|---|---|
| Vue générale | kg, coûts, barquettes, déclarations ; zones en logigramme ; devenir des pertes ; pertes évitables et familles de causes |
| Par zone, Par équipe (« Mon équipe » pour un compte équipe) | Comparaison et détail : causes, produits, postes, devenir, 8 semaines |
| Produits · Causes et destinations | Classements (plats, sous-recettes partagées, cause principale ; causes et destinations) |
| Évolution | Semaine précédente, moyenne 4 semaines, même semaine l'an passé, à volume égal ; coûts par composante ; tendances |
| Ratios | Pertes rapportées à la production prévue (plan) et réelle (Décompte barquettes) |
| Synthèse de la semaine | Résumé imprimable (2 à 3 pages) : anneaux en € et en kg par zone, cause, produit ; plus fortes hausses ; 12 semaines |
| Valorisation | Pertes avec ou sans recette (ventes, dons), part récupérée ; ventes TGTG, flash, Linkee |
| Alchimistes | Nos kg déclarés face aux pesées des Alchimistes, écarts |
| Environnement | CO2e des pertes (par la recette Melba et les facteurs Agribalyse validés) |
| Rapports PDF | Hebdomadaire, mensuel, annuel, valorisation, environnemental |

Les répartitions sont en anneaux (6 parts + « autres », même couleur pour le même élément d'un anneau à l'autre) ;
une baisse des pertes s'affiche en vert. **Coûts des pertes** (menu à part) : brut, recettes, net, composantes, par équipe, par zone et semaine par
semaine, pour la période choisie (semaine, 2 dernières semaines, mois, année ou dates libres), totaux recalculés.

## Les coûts — d'où viennent les euros

- **Plats, sous-recettes, ingrédients de la semaine** : coûts du tome Melba de la semaine, figés sur la perte. Plat : matières seules ; moule ou plat à gratin et barquette ajoutés seulement s'ils sont jetés, question posée en salle blanche et en salle des cartons.
- **Matières premières** : prix d'achat en vigueur à la date de la perte (tome, bons de commande, ou saisi à la main).
- **Emballages** : référentiel daté (moules Melba + emballages par plat).
- **Produit absent de la liste** : le prix indiqué à la saisie ou ajouté ensuite par l'administration.
- **Main-d'œuvre et coûts indirects** : pas encore imputés (méthode à définir).
- Une perte garde toujours le coût calculé le jour de sa saisie.

## L'administration

Rangée en 6 familles, de la plus utilisée à la plus rare :

| Famille | Options | Quand |
|---|---|---|
| **1. Chaque semaine** | Import de la semaine, rangé par jour : **mardi** tome Melba + plan, puis tome des encas (S+1) ; **jeudi** Décompte barquettes, pesées des Alchimistes, ventes TGTG / flash / Linkee (S-1), puis bons de commande (S+1) · Recoupement tome / bons · Matières à compléter | Chaque semaine |
| **2. Ce que les équipes voient à la saisie** | Causes (propositions des équipes, famille et évitabilité à valider) · Destinations (n° de poubelle) · Zones et postes · Gastros et tares | Au fil de l'eau |
| **3. Produits et achats** | Produits (articles saisis à la main, saisies hors liste, fiches : prix datés, colis, lieu, famille d'encas) · Fournisseurs (à valider, renommer) · Lieux de stockage des matières | Au fil de l'eau |
| **4. Équipes, comptes et calendrier** | Comptes et leurs zones · Équipes par semaine · Jours de production (fériés, samedis) | Ponctuellement |
| **5. Coûts et environnement** | Emballages et consommables · Main-d'œuvre · Facteurs d'émission (CO2e) · Rattachement des ingrédients | Quand les coûts changent, après chaque tome |
| **6. Alertes et contrôle** | Seuils des alertes · Journal d'audit | Ponctuellement |

Chaque semaine aussi : lire les alertes (accueil) et la **Synthèse de la semaine** pour la réunion de production.

## Ce qui a changé récemment (20 au 23 novembre)

- **Charte de La Brigade de Véro** : rouge, brun, crème, police Nunito ; logo à la connexion seulement.
- **Statistiques** : anneaux au lieu de barres, zones en logigramme, impression plus compacte.
- **Encas** : liste des 99 encas à part, rangés par famille, selon le lieu au Stockage.
- **Cuisine/production** : 3 façons de mesurer aux 4 postes, pesée en gastros ou en poids net.
- **Réception / Stockage** : article saisi à la main ajouté « à valider » ; n° de poubelle en encadré orange ;
  **n° de lot, DLC et photos**.
- **Causes** : familles de cause racine et pertes évitables ; 10 causes ajoutées ; Réception et Stockage revues avec
  le futur utilisateur (température retirée, étiquetage ajouté, Stockage renuméroté de 1 à 8) ; « Autres pertes »
  devient « Autres causes ».
- **Import** : un tome sans composition des plats est refusé (S47 et S48 réimportées en local).
- **Statistiques** : un seul accès ; part de l'équipe ou de la zone dans les pertes pour les équipes et les
  responsables de zone ; numéro de zone plus affiché deux fois.
- **Coûts des pertes** : choix de la période (semaine, mois, année, dates libres, raccourcis), totaux et semaine
  par semaine recalculés.
- **Administration** : options rangées en 6 familles ; Import de la semaine rangé par jour, avec la semaine concernée (S-1, S, S+1) et l'usage de chaque document.

## Ce qui reste à faire ou à décider

**Mise en ligne (à partir du 8 décembre)**, dans l'ordre, après une sauvegarde :
1. pousser les commits, puis passer les migrations **0014 à 0041** (GitHub → Actions → « Base de données ») ;
2. Administration → Produits → « Compléter depuis les tomes importés » ;
3. réimporter les semaines dont le tome a été importé avant le 19/11 (composition des plats manquante) ;
4. déposer le ZIP des bons de commande du Drive ;
5. ranger les catégories Melba dans les lieux de stockage.

**À valider par l'administration** : classement des causes (Administration → Causes) ; facteurs carbone et
rattachements « À revoir » ; articles et fournisseurs saisis à la main.

**Décisions métier encore ouvertes** : méthode d'imputation de la main-d'œuvre et des coûts indirects ; poids par
contenant pour l'estimation en gastros ; poids unitaires manquants (dont 10 encas) ; date de mise en service des
alertes ; lecture automatique des étiquettes (service en ligne payant) ; étape 3 du référentiel des pertes
(destinations), non demandée pour l'instant.

**Essai pilote** : préparé (fiche équipe, guide de l'administration, plan du pilote), à lancer après la mise en ligne.
