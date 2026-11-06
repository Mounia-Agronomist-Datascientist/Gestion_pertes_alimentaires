# Points à valider

Légende : 🔴 bloquant pour démarrer la Phase 1 · 🟠 nécessaire pendant la Phase 1 · ⚪ phases ultérieures.

## Décisions techniques

| # | Point | Proposition | Statut |
|---|---|---|---|
| T1 | Pile technique | Next.js + TypeScript + PostgreSQL + Drizzle (ARCHITECTURE.md §2) | ✅ Validé 06/11/2026 |
| H1 🟠 | Hébergement de production | Plateforme managée UE (app + PostgreSQL managé) | À décider avant la mise en production |
| G1 | Dépôt GitHub | github.com/Mounia-Agronomist-Datascientist/Gestion_pertes_alimentaires | ✅ |
| D1 | Base de développement | PostgreSQL 18 (Postgres.app) sur le poste local | ✅ |

## Règles métier (cf. §29 du cahier des charges)

| # | Point | Proposition / hypothèse | Bloque |
|---|---|---|---|
| 11 ✅ | Numérotation des semaines | Validé : n° et année = semaine ISO du lundi contenu dans la semaine jeudi→mercredi (S46 = 05/11/2026, S53 = 24/12/2026, S01-2027 = 31/12/2026). Calendrier stocké en base et corrigeable | — |
| 5 ✅ | Tares des gastros | Fichier reçu : tares unitaires proportionnelles, capacité 40/30 par échelle, échelles 21 kg et 52 kg | — |
| 5b 🟠 | Échelle sur la balance | Les gastros sont-ils toujours pesés sur leur échelle, ou parfois posés seuls sur la balance ? (l'écran proposera « sans échelle / échelle classique / échelle à four ») | Écran de saisie |
| 2 ✅ | Responsabilité équipe/zone | Cuisine/Production : équipe obligatoire. Réception, Stockage, Conditionnement, Plonge : responsable de zone, sans équipe | — |
| 2b 🟠 | Comptes équipe hors cuisine | Un compte équipe peut-il déclarer une perte constatée dans une autre zone (ex. au conditionnement) ? Proposition : oui, la perte est alors attribuée à la zone et non à l'équipe | Phase 1 |
| C3 🟠 | Causes « Chutes » | « Chute de gastro » (cuisine, gastro tombé) et « Chutes » (conditionnement) : s'agit-il de chutes au sens « tomber », ou de chutes de découpe ? | Libellés |
| C4 🟠 | Causes du stockage | Les causes du §12 non citées dans vos réponses (rupture de la chaîne du froid, mauvaise rotation, stock excédentaire…) n'ont pas été créées ; l'admin pourra les ajouter | Libellés |
| 1 🟠 | Comptes partagés | Mot de passe par équipe géré par l'admin ; rotation à chaque départ ; révocation des sessions. Durée de session sur appareil ? | Phase 1 |
| C1 🟠 | Correction par une équipe | Délai pendant lequel une équipe peut corriger sa déclaration (ex. jusqu'à la fin de la semaine de production), au-delà correction par un responsable | Phase 1 |
| C2 ✅ | Causes initiales | Listes reçues pour toutes les zones et chargées (26 causes, voir src/db/seed/data.ts) | — |
| P1 🟠 | Référentiel produits Phase 1 | Liste minimale de démarrage (export Melba même partiel, ou saisie des ~50 références les plus fréquentes) | Phase 1 |
| 4 🟠 | Poids unitaires et densités | Valeurs disponibles par produit/catégorie ; sinon quantités laissées non converties | Phase 1–2 |
| 12 🟠 | Utilisateurs | Comptes prévus : 8 comptes équipe + 4 responsables de zone (Réception, Stockage, Conditionnement, Plonge). Reste à nommer : responsable(s) de production, administrateur(s), direction | Phase 1 |
| 6 ⚪ | Melba | Exports disponibles, identifiants stables, rendements, coûts | Phase 2 |
| 7 ⚪ | Sous-recettes | Outil du collègue à étudier — **aucun développement avant** | Phase 2 |
| 3 ⚪ | Main-d'œuvre | Méthode d'imputation — désactivée tant que non définie | Phase 3 |
| 9 ⚪ | Récupération financière | Ventes à déduire du coût net | Phase 3 |
| 8 ⚪ | Volumes de production | Source des dénominateurs des ratios | Phase 4 |
| 10 ⚪ | Facteurs carbone | Sources (ADEME / Base Empreinte) et niveau de précision | Phase 5 |
