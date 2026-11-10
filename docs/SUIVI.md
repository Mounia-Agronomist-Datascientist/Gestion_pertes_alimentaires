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
- 2026-11-06 : délai de 7 jours pour les équipes ; aucun prénom dans l'application ; administration des
  comptes, des équipes par semaine et des causes (avec propositions des équipes).

- 2026-11-06 : extrait de test S45 (plan + tome, sans données personnelles) ; analyse du « Décompte barquettes »
  et du « Déboitage » ; règle d'alerte « rien de noté » documentée.

- 2026-11-06 : alerte « rien de noté » (150 kg par plage de réutilisation), jours de production, page Alertes.

- 2026-11-09 : préparation de la mise en ligne (Netlify + Neon) : configuration, en-têtes de sécurité,
  initialisation de la base de production, sauvegarde chiffrée et restauration testées, tâches GitHub.

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
| 2026-11-06 | Délai des équipes (7 jours) pour déclarer / corriger / annuler, retard de saisie affiché | 4 tests |
| 2026-11-06 | Administration des comptes : création (mot de passe provisoire affiché une fois), réinitialisation, désactivation | 6 tests d'intégration ; écran vérifié dans le navigateur |
| 2026-11-06 | Équipes inactives pour une semaine (en cours / suivante) | 1 test d'intégration ; écran vérifié |
| 2026-11-06 | Causes : proposition par les utilisateurs pendant la saisie, validation (avec reformulation et choix des zones) ou rejet, création, modification, désactivation, doublons de formulation refusés, « Autres pertes » toujours disponible | 6 tests d'intégration ; proposition → validation vérifiée dans le navigateur et en base |
| 2026-11-06 | Alertes « rien de noté » : plages jeudi-vendredi / lundi-mercredi, 150 kg estimés, régularisation, levée avec motif, bandeau équipe, page Alertes, tâche quotidienne | 6 tests unitaires + 9 tests d'intégration ; vues équipe et administration vérifiées dans le navigateur |
| 2026-11-10 | Phase 3 — recettes encaissées sur les lignes de vente (à la déclaration ou plus tard) et coût net | 3 tests d'intégration ; parcours vérifié dans le navigateur (mobile) |
| 2026-11-10 | Correctif en ligne : connexion et déconnexion par formulaire classique (cookie posé sur une redirection 303), contrôle d'origine ; sur Netlify, chaque page redemandait la connexion | Test automatique dans Chrome (développement et build de production) : connexion, cookie, navigation ; 2 tests unitaires |
| 2026-11-10 | Phase 3 — coût brut figé par perte : matières hors moules, emballages (moules Melba + référentiel à la date de la perte), méthode et détail ; affichage au récapitulatif et dans le détail | 4 tests unitaires + 1 d'intégration ; VI03 vérifiée dans le navigateur |
| 2026-11-10 | Phase 3 — référentiel des emballages et consommables (coûts datés, quantités par plat et par petit-déjeuner) | 4 tests d'intégration ; écran vérifié dans le navigateur (mobile) |
| 2026-11-10 | Phase 2 — coût de la semaine figé sur chaque perte (plat, sous-recette au kg net, ingrédient) et coût matière estimé affiché | 4 tests unitaires + 2 d'intégration ; VI01 × 4 = 5,32 € vérifié dans le navigateur |
| 2026-11-10 | Règles R10 validées : portion = barquette (contrôle 300–380 g à l'import), catégorie « Moules et plats à gratin », tous les plats au conditionnement | 3 tests ajoutés |
| 2026-11-09 | Phase 2 — saisie à partir des produits de la semaine : plats de l'équipe → sous-recettes → ingrédients, encas en conditionnement/réception/stockage, recherche, semaine précédente, conversion par portion ou poids unitaire | 6 tests d'intégration ; déclaration VI01 faite dans le navigateur (mobile) |
| 2026-11-09 | Phase 2 — écran d'import (Administration → Import de la semaine) : fichiers lus dans le navigateur, aperçu par équipe, anomalies, validation, liste des versions ; règle R9 des encas | Import S45 réel fait dans le navigateur (mobile) ; construction Netlify locale |
| 2026-11-09 | Phase 2 — enregistrement d'une semaine importée : rapprochement tome + plan (équipe, barquettes, anomalies bloquantes ou à vérifier), instantané figé par semaine, nouvelle version tracée en cas de réimport | 3 tests unitaires + 3 tests d'intégration ; S45 : 82 plats, 105 sous-recettes, 695 lignes |
| 2026-11-09 | Phase 2 — lecture du plan de production (classeur Excel, onglet de la semaine) : groupes de codes → équipe et barquettes, barquettes par code, anomalies | 8 tests unitaires ; extrait S45 : 30 groupes, 60 codes, 0 anomalie |
| 2026-11-09 | Phase 2 — lecture du tome Melba (PDF) : recettes, sous-recettes, ingrédients, poids unitaires, coûts, poids brut/net, anomalies ; commentaires jamais lus | 9 tests unitaires ; tome S45 réel : 82 recettes, 105 sous-recettes, 0 anomalie, coûts cohérents |
| 2026-11-09 | Journal d'audit consultable (administration et responsable production) : filtres objet / auteur / période, pagination, champs modifiés en clair, détail avant/après sans aucune donnée de mot de passe, lien vers la déclaration | 2 tests unitaires + 4 tests d'intégration ; filtres et absence d'empreinte de mot de passe vérifiés dans le navigateur (mobile) |
| 2026-11-09 | Administration des destinations (création, reformulation, type figé une fois utilisée, ordre, désactivation) et des zones et postes (renommage, nouveau poste avec le mode d'attribution de sa zone, ordre, désactivation en gardant un poste actif par zone) | 6 tests d'intégration + 1 test unitaire ; changement d'ordre vérifié dans le navigateur (mobile) puis rétabli |
| 2026-11-09 | Administration des gastros et tares : tare en vigueur, nouvelle tare datée (clôture de la précédente la veille), correction d'une tare jamais utilisée, historique, nombre maximum par pesée, désactivation | 5 tests d'intégration ; refus d'une date antérieure vérifié dans le navigateur (mobile) |
| 2026-11-09 | Administration des produits : création, modification, désactivation (doublons de nom ou de code refusés, poids unitaire et densité seulement si connus) ; saisies « hors liste » regroupées par nom et rattachées à un produit (existant ou créé) avec une nouvelle version de chaque déclaration et conversion en kg si possible | 6 tests d'intégration ; création + rattachement vérifiés dans le navigateur (mobile) et en base |
| 2026-11-09 | Administration des jours de production : retirer un jour férié, ajouter un samedi travaillé, navigation par semaine, motif et audit ; pris en compte par les alertes | 4 tests d'intégration ; ajout puis retrait d'un samedi vérifiés dans le navigateur (mobile) |
| 2026-11-09 | Mise en ligne sur Netlify + Neon : adresse de base contrôlée sans être affichée dans les journaux, adaptateur Next.js de Netlify déclaré | Application en ligne, connexion admin et changement de mot de passe faits par l'administratrice |
| 2026-11-09 | Préparation de la mise en ligne : `db:setup` (sans comptes de test), sauvegarde/restauration chiffrées, workflows GitHub (tests, sauvegarde, alertes, base), en-têtes de sécurité | Base vide initialisée localement ; sauvegarde → restauration identique ; build de production et en-têtes vérifiés |
| 2026-11-06 | Écrans : connexion, changement de mot de passe, accueil (équipe, semaine en cours lue en base), déconnexion | Vérification manuelle |
| 2026-11-06 | Référentiels (équipes, zones, sous-zones, causes, destinations, unités, contenants, tares, rôles, permissions, comptes, audit) + données initiales idempotentes | 11 tests d'intégration |

## Anomalies connues / points de vigilance

- TypeScript 7 (nouvelle version native) est utilisé ; si un outil devient incompatible, revenir à TypeScript 5.x.
- ESLint/Prettier pas encore configurés (prévu au début de la Phase 1).
- En mode groupé, les lignes non validées restent sur l'appareil (stockage du navigateur) : elles sont
  perdues si l'on vide les données du navigateur avant de valider.
- Le référentiel des produits se saisit à la main (Administration → Produits) en attendant l'import de la Phase 2.
- L'estimation par contenant (« 2 gastros pleins ») n'est pas convertie en kg : il faudrait un poids de
  référence par produit et par contenant.
- La base de développement a été réinitialisée le 06/11/2026 (comptes renommés par fonction) ; elle contient
  une cause de test validée : « Bac oublié en chambre froide ».
- Écran de création de compte : testé par les tests d'intégration, pas encore manuellement dans le navigateur.
- Base de développement : `ALERTES_DEBUT=2026-11-02` dans le `.env` local (test) ; 8 alertes de test pour S45.
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
| `0006_alertes_jours_manquants` | Colonne `missing_days` sur les alertes | Alertes existantes : liste vide, recalculée à la prochaine évaluation |
| `0007_import_hebdomadaire` | Tables `weekly_imports`, `week_recipes`, `week_sub_recipes`, `week_recipe_lines` | Nouvelles tables vides ; aucune donnée existante modifiée |
| `0008_declaration_produit_semaine` | Colonnes `week_recipe_id`, `week_sub_recipe_id`, `week_line_id` sur les déclarations ; contrainte de référence produit élargie | Déclarations existantes inchangées (colonnes vides) |
| `0009_categorie_moules` | Valeur `moule_plat_gratin` ajoutée au type de produit | Aucune donnée modifiée |
| `0010_cout_matiere` | Colonnes `cost_per_kg_eur`, `cost_per_unit_eur`, `material_cost_eur`, `cost_import_id` sur les déclarations | Déclarations existantes sans coût (colonnes vides) |
| `0011_emballages` | Tables `packaging_items`, `packaging_item_costs` (coûts datés), `packaging_per_portion` | Nouvelles tables vides |
| `0012_cout_brut` | Colonnes du coût brut figé (emballages, main-d'œuvre, indirect, brut, méthode, date, détail) | Déclarations existantes sans coût brut (colonnes vides) |
| `0013_cout_net` | Colonnes `recovered_eur`, `net_cost_eur` sur les déclarations | Recettes vides, coût net vide pour les déclarations existantes |
| `0005_alertes_rien_de_note` | Tables `production_days` et `missing_declaration_alerts` | Aucune modification des tables existantes |
| `0003_declarations` | Création des 5 tables de déclarations, tares utilisées, destinations, versions et lots | Aucune modification des tables existantes |
| `0002_causes_par_sous_zone` | Création de `cause_subzones` | Aucune modification des tables existantes ; base de dév. recréée (aucune donnée réelle) |
