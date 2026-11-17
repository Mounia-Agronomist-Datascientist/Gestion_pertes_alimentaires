# Plan de tests

Commande unique : `npm test` (unitaires + intégration), `npm run test:e2e` (Playwright).
Chaque phase se termine par l'exécution complète de la suite (non-régression, §27.7).

## 1. Tests unitaires — `src/domain/` (Vitest)

| Règle | Cas testés |
|---|---|
| Semaine de production | jeudi = 1er jour ; mercredi = dernier jour ; exemple CDC : 05/11/2026 → S46 ; 11/11/2026 → S46 ; 12/11/2026 → S47 ; passage d'année (31/12/2026) ; date hors calendrier → erreur explicite |
| Déclaration tardive | même semaine → non tardive ; semaine suivante → tardive |
| Unités | g → kg ; mL → L ; L → kg avec densité ; L sans densité → non converti ; pièces avec/sans poids unitaire ; consommable → `sans_objet` ; refus des quantités ≤ 0 |
| Tares | 1 type × n gastros ; plusieurs types ; brut ≤ tare → erreur ; arrondis |
| Destinations | 100 % sur une destination ; répartition exacte (exemple CDC 20 kg = 5 + 8 + 4 + 3) ; écart → alerte ; tolérance d'arrondi ; justification exigée |
| Statuts | transitions autorisées / interdites |

## 2. Tests d'intégration — services + PostgreSQL (PGlite)

- Création d'une déclaration complète : semaine, instantanés produit, tare et version de tare enregistrés.
- Correction : nouvelle valeur, entrée d'audit avant/après, motif obligatoire, statut `corrigee`.
- Annulation : aucune suppression, exclusion des agrégats.
- Modification d'une tare après déclaration → la déclaration ancienne conserve sa tare (historique stable).
- Mode groupé : validation atomique (une ligne invalide → aucune ligne validée).
- Cause proposée : invisible dans les listes tant qu'elle n'est pas validée.
- Équipe désactivée pour une semaine : absente des choix, historique accessible.

## 3. Tests d'autorisation (obligatoires, par rôle)

- Équipe A ne peut **ni lire ni modifier** une déclaration de l'équipe B (appel direct du service, sans UI).
- Équipe A ne peut pas créer une déclaration au nom de l'équipe B (champ forcé par la session).
- Responsable de zone limité à ses zones.
- Direction : pas d'accès aux mutations.
- Utilisateur non connecté / session expirée / compte désactivé → refus.

## 4. Tests de bout en bout (Playwright, viewport mobile 390×844 et desktop)

- Connexion compte équipe → déclaration immédiate pesée → confirmation → visible dans l'historique.
- Déclaration avec gastro → poids net affiché et enregistré.
- Déclaration groupée de 3 lignes, modification d'une ligne avant validation.
- Répartition multi-destinations avec écart → alerte.
- Déclaration tardive (date de la semaine précédente) → marquée tardive.

## 5. Recette utilisateur

Avant mise en production de la Phase 1 : test avec 1 ou 2 équipes pilotes pendant une semaine, chronométrage
de la saisie, recueil des retours.

## 6. Tests de bout en bout (17/11/2026)

Parcours essentiels joués dans un vrai navigateur (Chrome, format tablette Android) sur l'application construite
pour la production et une base dédiée, recréée à chaque lancement (`tests/e2e/`, Playwright) :

1. Une équipe déclare une perte (zone, poste, produit hors liste, pesée, cause, destination), la retrouve dans
   l'historique et la corrige.
2. Une équipe déclare deux pertes d'un coup (série).
3. Une équipe ne voit pas les pertes d'une autre équipe, ni l'administration ; Too Good To Go, vente flash et
   Linkee ne lui sont pas proposés.
4. Sans réseau : la page de saisie s'ouvre, la perte est gardée sur l'appareil (bandeau « Hors ligne »), les autres
   pages affichent « Hors ligne » ; au retour du réseau, la perte part toute seule et apparaît dans l'historique.
5. L'administration consulte les alertes d'analyse et enregistre les seuils.

Lancement local : `npm run test:e2e` (base PostgreSQL `pertes_e2e`, créée une fois avec `createdb pertes_e2e` ; le
script de préparation refuse toute base dont le nom ne finit pas par `_e2e`). Comptes de test aux mots de passe
tirés au hasard à chaque lancement, jamais commités. Dans GitHub Actions : tâche « e2e » du workflow « Tests »,
avec une base PostgreSQL jetable ; rapport joint en cas d'échec.
