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
| 2.4 | Écran d'import : dépôt des deux fichiers, aperçu, anomalies, validation ; un nouvel import d'une semaine validée crée une nouvelle version tracée | ✅ Administration → Import de la semaine |
| 2.5 | Saisie : produits proposés selon l'équipe et la semaine (plat → sous-recette → ingrédient) | ✅ Étape « Quel produit ? » de la déclaration ; règles validées le 10/11/2026 (R10) |
| 2.6 | Coût de la semaine conservé avec chaque perte (préparation de la Phase 3) | ✅ Coût unitaire et coût estimé figés sur la déclaration (migration `0010`) |

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
    absents du tome, plats du tome sans équipe. Les encas (`EN…`, 22 en S45) ne sont jamais dans le plan : c'est normal
    (règle R9), ils ne sont pas signalés et seront proposés en conditionnement, réception et stockage.
- **Instantané figé** : plats, sous-recettes et compositions de la semaine, avec les coûts du tome.
- **Réimport** de la même semaine : nouvelle version, l'ancienne passe en « remplacée » (rien n'est effacé),
  trace dans le journal d'audit.
- Import réservé à l'administration (permission `referentiel.manage`).

## Écran d'import (2.4)

Administration → **Import de la semaine** :
1. déposer le tome (PDF) ; 2. déposer le classeur du plan (Excel) — l'onglet de la semaine du tome est choisi
automatiquement ; 3. aperçu : plats par équipe avec barquettes, nombre d'encas et de sous-recettes, erreurs
bloquantes, points à vérifier, avertissement si la semaine est déjà importée ; 4. valider.

**Les fichiers sont lus dans le navigateur** et ne sont jamais envoyés au serveur : seules les données lues
(environ 150 Ko pour une semaine, contre près de 10 Mo de fichiers) partent, ce qui respecte la limite d'envoi
de Netlify et garde sur l'ordinateur les autres onglets du classeur. Le serveur revérifie la forme des données
(`payload.ts`) et refait lui-même le rapprochement avant d'enregistrer.

Le travailleur de pdfjs est copié dans `public/` à chaque installation (`postinstall` → `scripts/copy-pdf-worker.mjs`).

Vérifié avec les vrais fichiers (tome S45 et classeur du 09/11/2026) dans le navigateur : lecture en quelques
secondes, onglet S45 choisi seul, 60 plats sur 8 équipes, 22 encas, 105 sous-recettes, import enregistré
(82 plats, 695 lignes) ; affichage mobile vérifié ; construction Netlify locale réussie.

## Saisie à partir des produits de la semaine (2.5)

Étape « Quel produit ? » de la déclaration :
- **poste de cuisine** : les plats de l'équipe pour la semaine (plan de production) ; un plat s'ouvre sur « Le plat
  entier (barquettes) » et ses composants ; une sous-recette s'ouvre sur « La sous-recette entière » et ses
  ingrédients (sous-recettes imbriquées comprises) ;
- **conditionnement** : tous les plats de la semaine et les encas ; **réception, stockage** : les encas (R9, R10) ;
- moules et plats à gratin du tome : catégorie « Moules et plats à gratin », sans conversion en kg ;
- **recherche** : plats, sous-recettes et ingrédients de la semaine proposés au poste, puis le référentiel saisi
  à la main ; « Produit absent de la liste » reste possible ;
- semaine en cours et semaine précédente (déclarations tardives) : un sélecteur permet de passer de l'une à
  l'autre ; la date de la perte doit être dans la semaine du produit (contrôle à l'écran et côté serveur).

La déclaration garde le nom et le type du produit comme avant, plus un lien vers le plat, la sous-recette ou
l'ingrédient de l'import (migration `0008`). Conversion en kg : poids d'une portion pour un plat ou un encas
(règle R10), poids unitaire du tome pour un ingrédient (« Pot (125 g) »).

Côté serveur : le produit doit appartenir à l'import en vigueur de la semaine de la perte ; un plat de cuisine
doit être celui de l'équipe ; un encas ne se déclare qu'en conditionnement, réception ou stockage.

Vérifié : 6 tests d'intégration sur l'import S45 réel ; dans le navigateur (mobile), 4 barquettes de VI01
déclarées pour l'équipe D le 03/11 → 1,26 kg, comptées en S45 ; encas affichés en conditionnement.

## Coût de la semaine (2.6)

Pour un produit de la semaine, la déclaration garde **les coûts du tome Melba de sa semaine**, figés à la saisie
(un nouveau tome ne change pas une perte passée) :

| Produit | Coût unitaire | Exemple S45 |
|---|---|---|
| Plat / encas | coût de la portion (« Recette totale ») et coût au kg = coût ÷ poids de la portion | VI01 : 1,33 € la portion, 4,22 € le kg |
| Sous-recette | coût des ingrédients ÷ **poids net** (après cuisson), à défaut ÷ quantité de référence | Tagliatelles : 0,37 € pour 140 g nets → 2,64 €/kg |
| Ingrédient | coût de la ligne ÷ sa quantité (en g, ou à la pièce s'il se compte) | Yaourt : 0,74 € pour 2 pots de 125 g → 0,37 € le pot |

**Coût matière estimé** de la perte = poids net × coût au kg, sinon nombre × coût unitaire (barquettes, pièces) ;
rien si le coût ou la conversion manque (jamais deviné). Affiché au récapitulatif de la saisie et dans le détail
de la perte. Produits du référentiel et hors liste : pas de coût.

Limite connue : le tome arrondit les coûts au centime ; pour un ingrédient en petite quantité dans une ligne
(30 g à 0,07 €), le coût au kg est approché (± quelques %). Les plats et sous-recettes, calculés sur leur total,
sont précis.

Vérifié : 4 tests unitaires, 2 tests d'intégration ; dans le navigateur, 4 barquettes de VI01 → ≈ 5,32 €
(4 × 1,33 €), enregistré et affiché dans le détail.

**Phase 2 terminée** (09–10/11/2026). La valorisation complète (recettes des ventes, destinations, impact
environnemental) relève de la Phase 3.

## Tome imprimé pour toute la semaine (10/11/2026, tome S46)

Le tome peut être imprimé **pour une portion** (S45 : « 1 recette(s) (315.1 g) ») ou **pour toute la production de
la semaine** (S46 : « 2792 recette(s) (312.2 g) », VG02 = 871,66 kg et 2 911,43 €). La lecture ramène toujours une
recette à **une portion** (quantités et coûts divisés par le nombre de recettes), pour que les coûts restent justes
quelle que soit l'impression. Les sous-recettes n'en ont pas besoin (coût au kg net, indépendant de la quantité).

Les grands nombres décalent les colonnes : leur position est lue dans l'en-tête de chaque tableau (« Quantité
pour », « Unité ») au lieu d'une position fixe, et le coût est reconnu à son « € ». « Bombe de graisse pour moule »
n'est plus pris pour un moule (seuls les libellés qui commencent par « Moule » ou contiennent « plat à gratin »).

Tome S46 réel : 59 recettes, 110 sous-recettes, 675 lignes, aucune anomalie ; avec l'onglet S46 du plan :
8 équipes, 2 points à vérifier (PJ05 prévu au plan mais absent du tome ; QD09 à 380,3 g).
