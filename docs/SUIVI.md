# Suivi du projet

## Journal des phases

### Phase 0 — Cadrage technique (terminée)
- 2026-11-06 : rédaction de l'architecture, du schéma de base, des écrans Phase 1, des règles de sécurité,
  du plan de tests et des points à valider. **En attente de validation** avant toute ligne de code.
- 2026-11-06 : validation de la pile technique, de la règle de numérotation des semaines (S53-2026,
  S01-2027 au 31/12/2026) et du principe des tares variables selon le nombre de gastros.
- 2026-11-06 : socle technique (Next.js 16, React 19, Drizzle, PostgreSQL 18, Vitest 5, PGlite, Tailwind 4),
  règle des semaines de production codée et testée, première migration.

- 2026-11-06 : application sur le port 3001 ; schéma des référentiels et données initiales ; règles
  tares (avec échelles), unités et destinations codées et testées.

### Phase 1 — Déclarations (en cours)
- 2026-11-06 : causes complétées (chutes de découpe au déboîtage, causes de stockage du §12) ;
  connexion, sessions, changement de mot de passe, comptes de développement ; accueil aux couleurs de l'équipe.
- 2026-11-06 : déclaration immédiate d'une perte (assistant mobile en 6 à 8 étapes), enregistrement avec
  historique des versions et journal d'audit.
- 2026-11-06 : historique des pertes (liste par semaine, détail, versions), corrections et annulations
  versionnées avec motif.
- 2026-11-06 : déclaration groupée (« plusieurs pertes »), enregistrée en une seule fois, tout ou rien.

## Fonctionnalités terminées

| Date | Fonctionnalité | Tests |
|---|---|---|
| 2026-11-06 | Règle R1 : calcul et génération du calendrier des semaines de production (`src/domain/semaine-production.ts`) | 22 tests unitaires |
| 2026-11-06 | Table `production_weeks` avec contraintes (début un jeudi, 7 jours, unicité) | 4 tests d'intégration |
| 2026-11-06 | Règle R3 : poids net avec tares de gastros et d'échelle (`src/domain/tares.ts`) | 9 tests unitaires |
| 2026-11-06 | Règle R2 : conversion en kg (`src/domain/unites.ts`) | 9 tests unitaires |
| 2026-11-06 | Règle R4 : répartition entre destinations (`src/domain/destinations.ts`) | 8 tests unitaires |
| 2026-11-06 | Connexion, sessions glissantes, blocage après 5 échecs, changement de mot de passe, périmètres de lecture | 14 tests d'intégration + vérification manuelle dans le navigateur (mobile) |
| 2026-11-06 | Service d'enregistrement d'une déclaration : attribution équipe/zone, semaines et retards, tares, conversions, causes par zone/sous-zone, destinations, version 1 + audit | 25 tests d'intégration |
| 2026-11-06 | Écran « Déclarer une perte » : zone, poste, équipe, produit (liste ou hors liste), quantité avec calcul de tare en direct, cause filtrée, destination(s) avec reste à affecter, récapitulatif, confirmation | Parcours complet vérifié dans le navigateur (mobile) et en base |
| 2026-11-06 | Corrections et annulations : nouvelle version complète, motif obligatoire, verrou contre les modifications simultanées, droits par rôle et délai pour les équipes | 8 tests d'intégration |
| 2026-11-06 | Écrans « Pertes déclarées » (liste filtrée par semaine, annulées masquables), détail avec historique des versions et champs modifiés, correction via l'assistant prérempli, annulation | Création → correction → annulation vérifiées dans le navigateur (mobile) et en base |
| 2026-11-06 | Déclaration groupée : lignes préparées sur l'appareil (conservées après rechargement), même endroit réutilisé, modifier / retirer une ligne, validation en une transaction, ligne fautive signalée | 3 tests d'intégration + série de 2 pertes vérifiée dans le navigateur et en base |
| 2026-11-06 | Écrans : connexion, changement de mot de passe, accueil (équipe, semaine en cours lue en base), déconnexion | Vérification manuelle |
| 2026-11-06 | Référentiels (équipes, zones, sous-zones, causes, destinations, unités, contenants, tares, rôles, permissions, comptes, audit) + données initiales idempotentes | 11 tests d'intégration |

## Anomalies connues / points de vigilance

- TypeScript 7 (nouvelle version native) est utilisé ; si un outil devient incompatible, revenir à TypeScript 5.x.
- ESLint/Prettier pas encore configurés (prévu au début de la Phase 1).
- En mode groupé, les lignes non validées restent sur l'appareil (stockage du navigateur) : elles sont
  perdues si l'on vide les données du navigateur avant de valider.
- Le référentiel des produits est vide : toutes les saisies sont « hors liste » en attendant une liste de départ.
- L'estimation par contenant (« 2 gastros pleins ») n'est pas convertie en kg : il faudrait un poids de
  référence par produit et par contenant.
- Une déclaration de test (« Purée de carottes (test) », corrigée puis annulée) existe dans la base de
  développement locale.
- Le délai de correction des équipes (fin de la semaine de saisie) est une proposition en attente de validation.
- Au premier lancement du serveur de développement, Postgres.app peut demander d'autoriser la connexion :
  tant que ce n'est pas accepté, les pages renvoient une erreur de connexion à la base.
- Les tests de bout en bout automatisés (Playwright) ne sont pas encore en place ; les écrans ont été vérifiés
  à la main dans le navigateur.

## Migrations appliquées

| Migration | Contenu | Données existantes |
|---|---|---|
| `0000_init_production_weeks` | Création de `production_weeks` | Aucune (base vide) |
| `0001_referentiels_phase1` | Création des 18 tables de référentiels, comptes et audit | Aucune modification de `production_weeks` |
| `0004_lignes_versionnees` | Colonne `revision` sur les tares et destinations des déclarations | Lignes existantes rattachées à la version 1 |
| `0003_declarations` | Création des 5 tables de déclarations, tares utilisées, destinations, versions et lots | Aucune modification des tables existantes |
| `0002_causes_par_sous_zone` | Création de `cause_subzones` | Aucune modification des tables existantes ; base de dév. recréée (aucune donnée réelle) |
