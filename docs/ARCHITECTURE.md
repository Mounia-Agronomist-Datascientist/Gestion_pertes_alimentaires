# Architecture technique (proposition Phase 0)

## 1. Principes directeurs

1. **Simplicité de saisie d'abord** : une perte doit se déclarer en moins de 30 secondes sur téléphone.
2. **Règles métier centralisées et pures** : semaines, unités, tares, répartition des destinations, coûts
   sont des fonctions TypeScript sans dépendance à l'interface ni à la base, testées unitairement.
3. **Sécurité côté serveur** : aucune restriction d'accès ne repose sur l'affichage. Toute lecture/écriture
   passe par une couche d'accès qui applique le périmètre de l'utilisateur (équipe, zone, global).
4. **Historique immuable** : les déclarations conservent un instantané des références, tares et coûts
   utilisés. Aucune donnée n'est supprimée physiquement ; toute modification est journalisée.
5. **Modularité** : un dossier par domaine métier, dépendances à sens unique (UI → services → domaine).
6. **Référentiels administrables** : zones, causes, destinations, équipes, tares, unités sont en base, pas
   dans le code.

## 2. Technologies retenues

| Besoin | Choix | Justification |
|---|---|---|
| Langage | **TypeScript** (mode strict), front et back | Un seul langage, typage de bout en bout, exigence §27.4 |
| Framework web | **Next.js** (App Router, React) | Front + API dans un seul projet, rendu serveur, Server Actions = logique et autorisation côté serveur par construction, PWA facile, très bien maîtrisé par Claude |
| Base de données | **PostgreSQL 16+** | Relationnelle (§24.3), robuste, `numeric` exact pour les montants, JSONB pour l'audit, Row Level Security disponible |
| Accès BDD / migrations | **Drizzle ORM + drizzle-kit** | Schéma typé en TypeScript, migrations **SQL lisibles et versionnées** dans git (§27.3) |
| Validation | **Zod** | Mêmes schémas de validation côté formulaire et côté serveur |
| Authentification | Sessions serveur maison (cookie `httpOnly`) + **Argon2id** | Comptes partagés par équipe sans e-mail : un fournisseur OAuth n'apporte rien ; implémentation courte et auditable |
| UI | **Tailwind CSS** + composants accessibles (Radix / shadcn/ui) | Gros boutons mobiles, cohérence visuelle, pas de dépendance lourde |
| PWA | Manifest + service worker minimal | Installation sur l'écran d'accueil ; pas de hors-ligne en V1 (§24.6) |
| Tests unitaires / intégration | **Vitest** + **PGlite** (PostgreSQL embarqué en WebAssembly) | Les tests d'intégration tournent sur un vrai moteur PostgreSQL sans Docker ni installation |
| Tests de bout en bout | **Playwright** | Parcours de déclaration sur viewport mobile et desktop |
| Imports (Phase 2) | `exceljs` / `papaparse` | Lecture Excel/CSV côté serveur avec prévisualisation |
| Graphiques (Phase 4) | Recharts ou équivalent | Décidé en Phase 4 |

### Alternatives écartées

- **Application native iOS/Android** : non demandée en V1 (§24.1).
- **Front SPA + API séparée (React + Fastify/NestJS)** : deux projets à maintenir, plus de surface de sécurité,
  sans bénéfice à cette échelle (≈ 20 utilisateurs simultanés).
- **Supabase « tout intégré » (auth + RLS comme seule barrière)** : possible, mais déplace la logique métier dans
  des politiques SQL plus difficiles à tester ; on conserve PostgreSQL, éventuellement hébergé chez Supabase/Neon,
  mais l'autorisation reste dans notre code (+ RLS en défense en profondeur, voir SECURITE.md).
- **SQLite** : plus simple, mais moins adapté au multi-utilisateur hébergé et aux sauvegardes managées.

## 3. Vue d'ensemble

```
Navigateur (téléphone / tablette / PC) — PWA
        │ HTTPS
        ▼
Next.js (serveur Node)
 ├─ app/            Pages et Server Actions (entrée HTTP uniquement)
 ├─ modules/*/      Services applicatifs (autorisation + orchestration + transactions)
 ├─ domain/         Règles métier pures (semaines, unités, tares, destinations, coûts)
 └─ db/             Schéma Drizzle, migrations SQL, seeds
        │
        ▼
PostgreSQL  (+ sauvegardes quotidiennes)
```

Règle de dépendance : `app → modules → (domain, db)`. Le dossier `domain` n'importe **rien** de `db`, `app`
ni de Next.js.

## 4. Structure du projet

```
pertes/
├─ docs/                     Documentation (tenue à jour à chaque phase)
├─ src/
│  ├─ app/                   Routes Next.js
│  │  ├─ (public)/connexion/
│  │  ├─ (app)/declarer/          Déclaration immédiate
│  │  ├─ (app)/declarer/serie/    Déclaration groupée
│  │  ├─ (app)/historique/
│  │  └─ (app)/admin/…            Référentiels
│  ├─ modules/
│  │  ├─ auth/               Sessions, mots de passe, matrice d'autorisation, périmètres
│  │  ├─ referentiels/       Zones, sous-zones, équipes, causes, destinations, unités, produits, tares
│  │  ├─ declarations/       Création, correction, annulation, lots (mode groupé)
│  │  ├─ audit/              Journal des modifications
│  │  ├─ imports/            (Phase 2)
│  │  ├─ couts/              (Phase 3)
│  │  ├─ statistiques/       (Phase 4)
│  │  └─ environnement/      (Phase 5)
│  ├─ domain/
│  │  ├─ semaine-production.ts
│  │  ├─ unites.ts
│  │  ├─ tares.ts
│  │  ├─ destinations.ts
│  │  └─ couts.ts            (Phase 3)
│  ├─ db/
│  │  ├─ schema/             Une table / un groupe de tables par fichier
│  │  ├─ migrations/         SQL généré puis relu, jamais modifié après application
│  │  └─ seed/               Données initiales (zones, équipes, causes, destinations…)
│  └─ components/            Composants UI réutilisables
├─ tests/
│  ├─ unit/                  Règles du dossier domain
│  ├─ integration/           Services + PostgreSQL (PGlite)
│  └─ e2e/                   Playwright
└─ scripts/                  Sauvegarde, restauration, création de comptes
```

## 5. Conventions de code

- **Langue** : code (identifiants) en anglais ; libellés UI, documentation, messages de commit et noms des
  règles métier en français. Les termes métier gardent une traduction fixe (glossaire ci-dessous).
- TypeScript `strict`, ESLint + Prettier, pas de `any` non justifié.
- Montants en **centimes entiers** ou `numeric(12,4)` en base ; jamais de `float` pour l'argent.
- Quantités en `numeric(12,4)` ; conversions uniquement via `src/domain/unites.ts`.
- Dates : `date` pour la date réelle de la perte, `timestamptz` pour les horodatages ; fuseau `Europe/Paris`.
- Toute mutation passe par un service qui : vérifie la permission → valide (Zod) → écrit en transaction →
  écrit le journal d'audit.
- Commits : un commit = une étape cohérente et testée, avec un titre clair en français au format
  *Conventional Commits* : `type(module): ce qui change`, puis un détail en liste si nécessaire.
  | Type | Usage | Exemple |
  |---|---|---|
  | `feat` | nouvelle fonctionnalité | `feat(causes): chutes de découpe au déboîtage` |
  | `fix` | correction d'anomalie | `fix(tares): refuser un poids brut inférieur à la tare` |
  | `docs` | documentation seule | `docs: règle d'historisation des saisies` |
  | `chore` | outillage, configuration | `chore: application servie sur le port 3001` |
  | `test` | tests seuls | `test(auth): droits d'une équipe sur une autre équipe` |
  | `refactor` | réorganisation sans changement de comportement | |
- Migrations : jamais d'édition d'une migration déjà appliquée ; une migration destructive exige une
  sauvegarde préalable et une note dans `docs/SUIVI.md`.

### Glossaire

| Métier (FR) | Code (EN) |
|---|---|
| Déclaration de perte | `lossDeclaration` |
| Semaine de production | `productionWeek` |
| Zone / sous-zone | `zone` / `subzone` |
| Équipe | `team` |
| Cause | `cause` |
| Destination (valorisation) | `destination` |
| Tare / gastro | `tare` / `container` |
| Lot de saisie (mode groupé) | `declarationBatch` |
| Journal d'audit | `auditLog` |

## 6. Environnements

| Environnement | Usage | Base |
|---|---|---|
| Développement | Poste local (`npm run dev`) | PostgreSQL local (Postgres.app) ou PGlite |
| Test automatisé | `npm test` | PGlite en mémoire, recréée à chaque suite |
| Préproduction (recommandée) | Recette par les utilisateurs pilotes | Base dédiée, données fictives |
| Production | Usage réel | PostgreSQL managé, sauvegardé |

**L'hébergement de production reste à décider** (voir POINTS_A_VALIDER.md, point H1). Deux options :

1. **Managé (recommandé pour démarrer)** : application sur une plateforme Node (Vercel, Scalingo, Render… en
   région UE) + PostgreSQL managé en UE (Scalingo, Neon, Supabase…). Sauvegardes et HTTPS inclus, peu de
   maintenance, coût mensuel faible.
2. **Serveur de l'entreprise / VPS** : contrôle total des données, mais maintenance système, sauvegardes et
   certificats à la charge de l'entreprise.

## 7. Sauvegardes (proposition)

- Sauvegarde automatique quotidienne de la base (snapshot managé ou `pg_dump` planifié).
- Rétention : 7 quotidiennes, 4 hebdomadaires, 12 mensuelles.
- Copie hors du fournisseur principal au moins hebdomadaire.
- Sauvegarde manuelle obligatoire avant toute migration de production (`scripts/backup.sh`).
- **Test de restauration** documenté et réalisé au moins une fois avant la mise en production, puis chaque trimestre.
- Les sauvegardes contiennent des hachages de mots de passe : stockage chiffré et accès restreint.
