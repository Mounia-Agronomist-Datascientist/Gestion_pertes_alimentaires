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
| 2.2 | Lecture du plan de production (Excel de l'onglet) : groupes de codes → équipe, barquettes par code | ⏳ |
| 2.3 | Modèle de données par semaine (instantanés figés) et migration | ⏳ |
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
