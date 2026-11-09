# Phase 2 — Import hebdomadaire du plan de production et du tome Melba

Objectif : chaque semaine, l'administration dépose le plan de production et le tome Melba. L'application en tire
la liste des plats de chaque équipe, leurs sous-recettes et leurs ingrédients, avec les coûts de la semaine.
Les équipes choisissent alors le produit perdu dans **leurs plats de la semaine** au lieu de le taper.

Analyse détaillée des sources : [INTEGRATION_OUTIL_SOUS_RECETTES.md](INTEGRATION_OUTIL_SOUS_RECETTES.md).

## Décisions (09/11/2026)

| Sujet | Décision |
|---|---|
| Plan de production | **Fichier déposé** : l'onglet `Sxx` téléchargé en Excel depuis Google Sheets (Fichier → Télécharger). Aucun accès Google à configurer ; le fichier d'origine n'est jamais touché. |
| Tome Melba | **Le PDF tel quel** (« Imprimer les recettes »), lu par l'application, avec aperçu et anomalies avant validation. |
| Commentaires du tome | **Jamais enregistrés** : ils contiennent des appréciations et parfois des prénoms. |
| Coûts | Ceux du tome (référence Melba de la semaine), conservés par semaine. |

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 2.1 | Lecture du tome PDF : recettes, sous-recettes, ingrédients, quantités, poids unitaires, coûts, rendement (brut / net) ; rapport d'anomalies | ✅ Lecture faite (`src/modules/imports/tome/`) ; enregistrement en 2.3 |
| 2.2 | Lecture du plan de production (Excel de l'onglet) : groupes de codes → équipe, barquettes par code | ✅ Lecture faite (`src/modules/imports/plan/`), vérifiée sur le vrai classeur |
| 2.3 | Modèle de données par semaine (instantanés figés) et migration | ✅ Migration `0007`, rapprochement (`merge.ts`) et enregistrement (`service.ts`) |
| 2.4 | Écran d'import : dépôt des deux fichiers, aperçu, anomalies, validation ; un nouvel import d'une semaine validée crée une nouvelle version tracée | ⏳ |
| 2.5 | Saisie : produits proposés selon l'équipe et la semaine (plat → sous-recette → ingrédient) | ⏳ |
| 2.6 | Coût de la semaine conservé avec chaque perte (préparation de la Phase 3) | ⏳ |

## Lecture du tome (2.1)

Le PDF est lu avec `pdfjs-dist` côté serveur. Chaque page donne des morceaux de texte avec leur position :
les colonnes du tableau (nom, quantité, unité, coût) se reconnaissent à leur position horizontale, ce qui évite
de confondre un nombre du nom (« 5h45 ») avec une quantité. Les en-têtes et pieds de page d'impression (date,
lien Melba) sont ignorés.

Structure reconnue :
- **Recette** : `2026 S45_VI01-Nom du plat` → semaine, code, nom ; poids d'une portion ; composants
  (sous-recettes ou ingrédients) avec quantité, unité, poids unitaire éventuel (« Pot (125 g) ») et coût ;
  « Recette totale ».
- **Sous-recette** : nom, quantité de référence (« 140 g »), ingrédients, « Recette totale » (brut),
  « Poids net » (après cuisson) → rendement.
- Tout ce qui n'est pas reconnu est signalé dans le rapport, jamais deviné.

**Vérifié sur le tome S45 réel (107 pages)** : 82 recettes, 105 sous-recettes, 695 lignes, aucune anomalie ;
chaque nom lu se retrouve dans le texte de référence, et pour chaque recette et sous-recette la somme des coûts
des lignes redonne le coût total (contrôle intégré au rapport d'anomalies).

Cas particuliers gérés :
- nom sur plusieurs lignes, valeurs centrées sur la cellule ; ligatures coupées par le PDF (« Chouti|fl|ette ») ;
- en-tête de tableau répété en haut de chaque page ;
- consigne glissée parmi les ingrédients (« saupoudrer de parmesan | - | 0,00 € ») : ignorée ;
- sous-recette imprimée plusieurs fois : une seule fois, anomalie si les contenus diffèrent.

Données de test : `tests/fixtures/s45/tome-S45.items.json`, produit par `scripts/extract-tome-fixture.ts`
(titres, rendements et tableaux uniquement : ni commentaires, ni en-têtes, ni lien Melba).

## Lecture du plan de production (2.2)

Le fichier déposé est le **classeur entier** téléchargé depuis Google Sheets (Fichier → Télécharger →
Microsoft Excel) : seul l'onglet de la semaine (`S45`, `S2552`…) est lu ; les autres onglets, dont celui des
chefs d'équipe (noms, adresses e-mail), ne sont ni lus ni enregistrés.

Dans l'onglet, les colonnes sont repérées par leur titre et non par leur position :
- blocs « Référence PLATS » (plats puis petits-déjeuners) : groupe de codes → **équipe** (colonne « Equipe »)
  et **barquettes du groupe** (colonne « Nb de barq. ») ;
- bloc des barquettes par code, plus bas : code → barquettes de la semaine, barquettes du premier jour.

Anomalies signalées : onglet qui n'est pas une semaine, équipe non renseignée ou inconnue, code présent dans
deux groupes, code avec des barquettes mais sans groupe.

Vérifié sur l'extrait S45 : 18 groupes de plats, 12 de petits-déjeuners, 60 codes, 8 équipes, aucune anomalie.

Vérifié sur le vrai classeur téléchargé le 09/11/2026 (57 onglets) :
- le classeur garde les valeurs exactes (676,5) et leur format d'affichage (« 0 ») : le format est appliqué pour
  retrouver les valeurs affichées dans Google Sheets (677) ; l'onglet S45 est alors identique à l'extrait ;
- S03 à S47 : lues sans anomalie (30 à 36 groupes, 45 à 66 codes selon les semaines) ;
- S48 à S50 : certains groupes sans équipe (planning pas encore fait) → signalé ;
- S01, S02, S2551, S2552 : ancienne mise en page sans bloc « Référence PLATS » → signalé ; ces semaines passées
  ne sont pas à importer.

## Essais en local

Pour essayer les lectures sur de vrais fichiers sans les enregistrer dans GitHub, les déposer dans le dossier
`imports-local/` du projet (ignoré par Git). En production, les fichiers seront déposés dans l'écran d'import
(étape 2.4) et ne seront pas conservés : seules les données lues et validées sont enregistrées.

## Enregistrement d'une semaine (2.3)

- **Rapprochement** du tome et du plan : chaque plat reçoit son équipe, son groupe et ses barquettes.
  - Bloquant : tome vide, tome et onglet de semaines différentes, onglet sans plats, semaine absente du calendrier.
  - À vérifier (n'empêche pas la validation, conservé avec l'import) : anomalies de lecture, codes du plan
    absents du tome, recettes du tome sans équipe (en S45 : les 22 encas `EN…`, qui ne sont pas dans le plan).
- **Instantané figé** : plats, sous-recettes et compositions de la semaine, avec les coûts du tome.
- **Réimport** de la même semaine : nouvelle version, l'ancienne passe en « remplacée » (rien n'est effacé),
  trace dans le journal d'audit.
- Import réservé à l'administration (permission `referentiel.manage`).
