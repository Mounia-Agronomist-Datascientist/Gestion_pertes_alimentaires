# Sécurité et droits d'accès

## 1. Matrice d'autorisation (centralisée)

Stockée en base (`roles`, `permissions`, `role_permissions`), initialisée par seed, lue par une fonction unique
`can(user, permission)` + `scopeFor(user)` dans `src/modules/auth/`. **Aucun écran ne teste un rôle directement.**

| Permission | Équipe | Resp. zone | Resp. prod. | Admin | Direction |
|---|:-:|:-:|:-:|:-:|:-:|
| Déclarer une perte | ✅ (toutes zones, attribuée à l'équipe en cuisine) | ✅ (ses zones) | ✅ | ✅ | — |
| Lire le détail des déclarations | celles attribuées à son équipe + celles qu'elle a saisies | ses zones | toutes | toutes | — |
| Corriger / annuler une déclaration | son équipe, ⚠️ délai à définir | ses zones | ✅ | ✅ | — |
| Proposer une cause | ✅ | ✅ | ✅ | ✅ | — |
| Valider une cause proposée | — | — | — | ✅ | — |
| Statistiques globales simplifiées (sans détail par équipe) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comparer les équipes | — | — | ✅ | ✅ | ✅ |
| Gérer les référentiels | — | — | — | ✅ | — |
| Gérer les comptes | — | — | — | ✅ | — |
| Consulter le journal d'audit | — | — | ✅ (lecture) | ✅ | — |
| Indicateurs économiques / environnementaux (Phases 3–5) | — | — | ✅ | ✅ | ✅ |

## 2. Application côté serveur

1. Chaque Server Action / route API commence par `requireUser()` puis `requirePermission()`.
2. Les lectures passent par des **repositories périmétrés** : `scopeFor(user)` ajoute automatiquement
   `team_id = …` ou `zone_id IN (…)` à la requête. Il n'existe pas de fonction de lecture « sans périmètre »
   accessible aux pages équipes.
3. **Défense en profondeur (recommandée)** : Row Level Security PostgreSQL sur `loss_declarations` et tables
   liées, l'application positionnant `app.user_id` / `app.team_id` en début de transaction. Une erreur de code
   ne peut alors pas exposer les données d'une autre équipe.
4. Les identifiants envoyés par le client (équipe, zone) sont **revérifiés** côté serveur ; pour un compte
   équipe, l'équipe est imposée par la session, jamais lue depuis le formulaire.
5. Tests automatisés d'autorisation pour chaque rôle (voir PLAN_TESTS.md).

## 3. Authentification

- Mots de passe hachés en **Argon2id** ; longueur minimale 10 caractères pour les comptes équipe.
- Sessions : jeton aléatoire 256 bits, seul son hachage est stocké ; cookie `httpOnly`, `Secure`,
  `SameSite=Lax` ; expiration glissante (durée à valider : proposition 30 jours sur appareil d'équipe,
  12 h pour les comptes admin).
- Connexion et déconnexion par **formulaire classique** (`POST /connexion/session`, `POST /deconnexion`) : le
  cookie est posé ou effacé sur une redirection 303 ordinaire, et l'en-tête `Origin` doit être celui de
  l'application (protection CSRF). Les actions serveur ne posent plus de cookie : sur Netlify, ce cookie n'était
  pas enregistré par le navigateur (chaque page redemandait la connexion, 10/11/2026). Les redirections vers la
  connexion portent `Cache-Control: no-store`.
- Limitation des tentatives de connexion : 5 échecs en 15 min **par identifiant** bloquent cet identifiant
  15 min ; tout est journalisé. Pas de blocage par adresse IP : tous les appareils de l'usine sortent
  probablement par la même adresse, un blocage par IP bloquerait toutes les équipes à la fois.
- Comptes partagés : l'admin peut réinitialiser le mot de passe et **révoquer toutes les sessions** d'un compte
  (ex. départ d'un salarié). Procédure de rotation à valider (point 1 du CDC).
- Protection CSRF native des Server Actions + vérification de l'origine.

## 4. Journalisation

Journal d'audit en insertion seule : connexions (réussies/échouées), créations, corrections, annulations,
modifications de référentiels, de comptes et de tares, imports. Valeurs avant/après en JSON.

## 5. Données et infrastructure

- HTTPS obligatoire ; en-têtes de sécurité (CSP, HSTS, X-Frame-Options).
- Secrets uniquement en variables d'environnement, jamais dans git (`.env` ignoré, `.env.example` fourni).
- Utilisateur PostgreSQL applicatif sans droits DDL ; migrations exécutées par un rôle distinct.
- Sauvegardes : voir ARCHITECTURE.md §7.
- Données personnelles limitées (prénoms des responsables, identifiants de comptes) — pas de données
  individuelles de performance nominative en V1.
- Dépendances : `npm audit` en CI, mises à jour régulières.
