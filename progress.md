# Avancement — où en est-on ?

> Photo **courte** de l'état du projet, à lire en premier en reprenant le travail.
> Le détail (journal daté, tests, migrations) reste dans [docs/SUIVI.md](docs/SUIVI.md).
> La même information, lisible par un programme : [progress.yaml](progress.yaml).
> **Mettre à jour les deux fichiers à chaque commit d'étape.**

Dernière mise à jour : **18/11/2026** — dernier commit : `Saisie par lieu (colis en Réception et Stockage) et pertes par zone`

## En ce moment

- **Phase en cours** : Phase 6 — Optimisation et automatisation ([docs/PHASE6.md](docs/PHASE6.md))
- **Dernière étape faite** : 6.11 — Administration → Produits (18/11/2026) : les 11 étapes proposées sont faites
- **Prochaine étape** : à définir ensemble (Phase 6 complète au regard des étapes proposées)

## Phases

| Phase | Sujet | État |
|---|---|---|
| 0 | Cadrage technique | ✅ Terminée (06/11) |
| 1 | Déclarations | ✅ Livrée (06–09/11) |
| 2 | Import Melba (tome + plan), saisie par plats de la semaine | ✅ Livrée (09–10/11) |
| 3 | Calcul des coûts | ✅ Terminée (10/11) |
| 4 | Statistiques et exports | ✅ Terminée (12/11) |
| 5 | Valorisation, Alchimistes, environnement, rapports PDF | ✅ Terminée (13–16/11) |
| 6 | Optimisation et automatisation | 🔄 En cours (11 étapes sur 11) |

## Phase 6 — étapes

| Étape | Contenu | État |
|---|---|---|
| 6.1 | Tendances | ✅ 16/11 |
| 6.2 | Pertes inhabituelles | ✅ 16/11 |
| 6.3 | Causes récurrentes | ✅ 16/11 |
| 6.4 | Affichage des alertes et réglages | ✅ 17/11 |
| 6.5 | Envoi qui résiste aux coupures | ✅ 17/11 |
| 6.6 | Ouverture sans réseau | ✅ 17/11 |
| 6.7 | Référentiel des matières premières | ✅ 17/11 |
| 6.8 | Import des bons de commande | ✅ 18/11 |
| 6.9 | Recoupement de la semaine (tome / BC) | ✅ 18/11 |
| 6.10 | Saisie en Réception et en Stockage | ✅ 18/11 |
| 6.11 | Administration → Produits (fournisseurs, matières, prix) | ✅ 18/11 |

## Bloquants et en attente

- **Mise en ligne en attente** : crédits Netlify épuisés jusqu'au **08/12/2026**. Ensuite, dans l'ordre et après
  une sauvegarde : migrations 0014 à 0040 → « Compléter depuis les tomes importés » (Administration → Produits)
  → réimport des semaines dont le tome a été importé avant le 19/11 10 h (composition des plats manquante) → dépôt du ZIP des bons de commande ([docs/pilote/PLAN_PILOTE.md](docs/pilote/PLAN_PILOTE.md)).
- **Lieux de stockage des matières** : les 20 catégories Melba sont rangées en local (18/11) ; à refaire en ligne
  après la mise en ligne et le dépôt des bons (Administration → Lieux de stockage des matières).
- **Essai pilote** avec les équipes : préparé (docs/pilote/), pas encore lancé.
- **Mise en service des alertes** (P4) : après les essais des équipes.
- **Facteurs carbone** (10) : valider les facteurs proposés et les rattachements « À revoir ».
- **Main-d'œuvre** (3) et **coûts indirects** : méthode d'imputation à définir avec l'entreprise.
- **Estimation par contenant** (P2) et **poids unitaires** (4) : valeurs à fournir (densités des liquides : faites le 18/11).

Liste complète : [docs/POINTS_A_VALIDER.md](docs/POINTS_A_VALIDER.md).

## Règles de travail (rappel)

- Une étape validée par l'utilisatrice avant d'être codée ; un commit par étape.
- Ne jamais inventer de règle métier (coûts, densités, facteurs carbone) : signaler, proposer, demander.
- Aucun prénom ni adresse e-mail dans les données, les tests ou les commits.
- Next.js 16 : lire `node_modules/next/dist/docs/` avant d'écrire du code (AGENTS.md).
