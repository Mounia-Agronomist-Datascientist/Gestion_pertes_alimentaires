# Suivi du projet

## Journal des phases

### Phase 0 — Cadrage technique (en cours)
- 2026-11-06 : rédaction de l'architecture, du schéma de base, des écrans Phase 1, des règles de sécurité,
  du plan de tests et des points à valider. **En attente de validation** avant toute ligne de code.
- 2026-11-06 : validation de la pile technique, de la règle de numérotation des semaines (S53-2026,
  S01-2027 au 31/12/2026) et du principe des tares variables selon le nombre de gastros.
- 2026-11-06 : socle technique (Next.js 16, React 19, Drizzle, PostgreSQL 18, Vitest 5, PGlite, Tailwind 4),
  règle des semaines de production codée et testée, première migration.

## Fonctionnalités terminées

| Date | Fonctionnalité | Tests |
|---|---|---|
| 2026-11-06 | Règle R1 : calcul et génération du calendrier des semaines de production (`src/domain/semaine-production.ts`) | 22 tests unitaires |
| 2026-11-06 | Table `production_weeks` avec contraintes (début un jeudi, 7 jours, unicité) | 4 tests d'intégration |

## Anomalies connues / points de vigilance

- TypeScript 7 (nouvelle version native) est utilisé ; si un outil devient incompatible, revenir à TypeScript 5.x.
- ESLint/Prettier pas encore configurés (prévu au début de la Phase 1).
- La page d'accueil affiche la semaine **théorique** ; elle lira le calendrier stocké en base dès la Phase 1.

## Migrations appliquées

| Migration | Contenu | Données existantes |
|---|---|---|
| `0000_init_production_weeks` | Création de `production_weeks` | Aucune (base vide) |
