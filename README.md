# Pertes — Suivi, analyse et valorisation des pertes alimentaires et matières

Application web interne (PWA) permettant aux équipes de production de déclarer
rapidement leurs pertes, et aux responsables de les analyser (quantités, coûts,
causes, destinations, impact environnemental).

> **État du projet : Phase 1 en cours — référentiels et règles de calcul en place.**

## Documentation

| Document | Contenu |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, technologies retenues, structure du projet, conventions, environnements, sauvegardes |
| [docs/SCHEMA_BDD.md](docs/SCHEMA_BDD.md) | Schéma initial de la base de données |
| [docs/ECRANS_PHASE1.md](docs/ECRANS_PHASE1.md) | Écrans et parcours de la Phase 1 |
| [docs/SECURITE.md](docs/SECURITE.md) | Rôles, matrice d'autorisation, règles de sécurité |
| [docs/PLAN_TESTS.md](docs/PLAN_TESTS.md) | Stratégie et plan de tests |
| [docs/REGLES_METIER.md](docs/REGLES_METIER.md) | Règles de calcul centralisées (semaines, unités, tares, destinations) |
| [docs/POINTS_A_VALIDER.md](docs/POINTS_A_VALIDER.md) | Points bloquants et questions ouvertes |
| [docs/SUIVI.md](docs/SUIVI.md) | Fonctionnalités terminées, anomalies connues, journal des phases |

## Phasage

| Phase | Objet | Statut |
|---|---|---|
| 0 | Cadrage technique | ✅ |
| 1 | Déclarations de pertes (application utilisable) | 🟡 En cours — référentiels et règles de calcul faits |
| 2 | Référentiels et imports (Melba, CSV/Excel) | ⏳ |
| 3 | Calcul des coûts | ⏳ |
| 4 | Tableaux de bord et statistiques | ⏳ |
| 5 | Valorisation et environnement | ⏳ |
| 6 | Optimisation et automatisation | ⏳ |

## Lancement

### Prérequis
- Node.js 22 ou plus récent
- PostgreSQL (en développement : [Postgres.app](https://postgresapp.com), port 5432)

### Première installation
```bash
npm install
cp .env.example .env                 # puis adapter DATABASE_URL si besoin
createdb pertes_dev                  # avec Postgres.app : /Applications/Postgres.app/Contents/Versions/latest/bin/createdb
npm run db:migrate                   # applique les migrations SQL de src/db/migrations
npm run db:seed                      # charge les référentiels initiaux (sans écraser l'existant)
npm run db:check                     # vérifie la connexion
```

### Au quotidien
| Commande | Rôle |
|---|---|
| `npm run dev` | Lance l'application sur http://localhost:3001 (le port 3000 est réservé à une autre application) |
| `npm test` | Tests unitaires et d'intégration (PostgreSQL embarqué, sans configuration) |
| `npm run typecheck` | Vérification des types TypeScript |
| `npm run db:generate -- --name <nom>` | Génère une migration après modification de `src/db/schema/` |
| `npm run db:migrate` | Applique les migrations en attente |
| `npm run build` | Build de production |
