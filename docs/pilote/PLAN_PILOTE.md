# Plan de l'essai pilote

Objectif (docs/PLAN_TESTS.md §5) : faire utiliser l'application par **1 ou 2 équipes pendant une semaine de
production**, mesurer le temps de saisie, recueillir les retours et corriger avant d'étendre à toutes les équipes.

Les valeurs marquées **à valider** sont des propositions : à confirmer avant le début de l'essai.

## 1. Avant l'essai

| # | Action | Qui | État |
|---|---|---|---|
| 1 | Mise en ligne (à partir du 8 décembre) : sauvegarde, migrations 0014 à 0027 (workflow « Base de données »), déploiement, vérification de la connexion | Administration | ⏳ |
| 2 | Après la mise en ligne : « Charger la proposition Agribalyse » (Administration → Facteurs d'émission), déposer les fichiers TGTG, ventes flash et Linkee, « Compléter depuis les tomes importés » (Administration → Produits), déposer le ZIP du dossier des bons de commande du Drive | Administration | ⏳ |
| 3 | Choisir les équipes pilotes (**à valider** : une équipe de cuisine + le conditionnement, pour couvrir les deux modes : équipe et zone) | Production | ⏳ |
| 4 | Créer ou vérifier leurs comptes (sans prénom), noter les mots de passe hors de l'application | Administration | ⏳ |
| 5 | Tablettes Android : Chrome à jour, application installée sur l'écran d'accueil, connexion faite une première fois **avec réseau** (pour garder les pages de saisie) | Administration + équipes | ⏳ |
| 6 | Import de la semaine de l'essai (tome + plan) le mardi d'avant | Administration | ⏳ |
| 7 | Imprimer la **fiche équipe** (docs/pilote/FICHE_EQUIPES.md) et la poser près de chaque tablette | Administration | ⏳ |
| 8 | Présentation de 15 minutes aux équipes pilotes : une perte, une série, une correction, le mode hors ligne | Administration | ⏳ |
| 9 | Alertes « saisie incomplète » et d'analyse : **à valider** — ne pas fixer `ALERTES_DEBUT` pendant la semaine d'essai (pas de 150 kg estimés tant que les équipes apprennent), puis le fixer au lundi qui suit la fin de l'essai | Administration | ⏳ |

## 2. Pendant l'essai (une semaine, du jeudi au mercredi)

- Les équipes pilotes déclarent **toutes** leurs pertes dans l'application, au moment où elles ont lieu (ou en série
  en fin de service).
- **Garder l'ancien suivi en parallèle** pendant cette semaine (**à valider**) pour comparer les quantités.
- Un **point de 5 minutes** chaque jour avec les équipes pilotes : ce qui a bloqué, ce qui manque.
- **Chronométrer** quelques saisies chaque jour (voir la grille ci-dessous).
- **Tester volontairement une coupure** une fois : couper le wifi de la tablette, ouvrir l'application, déclarer une
  perte, rallumer le wifi, vérifier qu'elle apparaît dans « Pertes déclarées ».

## 3. Grille d'observation

| Observation | Comment la mesurer | Objectif (**à valider**) |
|---|---|---|
| Temps d'une saisie simple (pesée, une destination) | Chronomètre, de « Déclarer une perte » à « Perte enregistrée » | Moins de 45 secondes |
| Temps d'une série de 5 pertes | Chronomètre | Moins de 3 minutes |
| Pertes oubliées | Comparaison avec l'ancien suivi | Aucune |
| Produits introuvables | Saisies « hors liste » (Administration → Produits) | Moins de 5 % des saisies |
| Causes qui manquent | Causes proposées, « Autres pertes » avec commentaire | Liste à compléter |
| Quantités non converties en kg | Statistiques : « sans poids en kg » | À identifier (estimations par contenant) |
| Coupures de réseau | Bandeau « Hors ligne », pertes en attente | Aucune perte perdue |
| Erreurs de saisie corrigées | Historique des versions | À suivre |
| Ressenti des équipes | Questions de fin d'essai (§5) | — |

## 4. Après l'essai

1. Relire avec les équipes pilotes les pertes de la semaine (Statistiques → Synthèse de la semaine, rapport PDF).
2. Comparer avec l'ancien suivi.
3. Lister les corrections à faire dans l'application (causes, produits, écrans), les faire, puis décider de
   l'extension aux autres équipes.
4. Fixer la date de mise en service des alertes (`ALERTES_DEBUT`, variable du dépôt GitHub).
5. Déposer le « Décompte barquettes » de la semaine pour vérifier les ratios.

## 5. Questions de fin d'essai (aux équipes)

1. Combien de temps vous prend une déclaration ? Est-ce acceptable pendant le service ?
2. Qu'est-ce qui vous a fait hésiter ou perdre du temps ?
3. Avez-vous trouvé vos produits ? Lesquels manquaient ?
4. Les causes proposées correspondent-elles à ce qui se passe ? Lesquelles ajouter ?
5. Avez-vous eu des coupures ? La perte est-elle bien partie ensuite ?
6. Préférez-vous déclarer au fil de l'eau ou en fin de service ?
7. Qu'est-ce qu'il faudrait changer avant d'étendre à toutes les équipes ?
