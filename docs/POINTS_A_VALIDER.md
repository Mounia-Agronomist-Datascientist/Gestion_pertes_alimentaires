# Points à valider

Légende : 🔴 bloquant pour démarrer la Phase 1 · 🟠 nécessaire pendant la Phase 1 · ⚪ phases ultérieures.

## Décisions techniques

| # | Point | Proposition | Statut |
|---|---|---|---|
| T1 | Pile technique | Next.js + TypeScript + PostgreSQL + Drizzle (ARCHITECTURE.md §2) | ✅ Validé 06/11/2026 |
| H1 🟠 | Hébergement de production | Décision : hébergeur géré, sécurisé et gratuit pour démarrer, puis migration vers la plateforme du développeur de l'entreprise. Offre précise à choisir | Mise en ligne |
| G1 | Dépôt GitHub | github.com/Mounia-Agronomist-Datascientist/Gestion_pertes_alimentaires | ✅ |
| D1 | Base de développement | PostgreSQL 18 (Postgres.app) sur le poste local | ✅ |

## Règles métier (cf. §29 du cahier des charges)

| # | Point | Proposition / hypothèse | Bloque |
|---|---|---|---|
| 11 ✅ | Numérotation des semaines | Validé : n° et année = semaine ISO du lundi contenu dans la semaine jeudi→mercredi (S46 = 05/11/2026, S53 = 24/12/2026, S01-2027 = 31/12/2026). Calendrier stocké en base et corrigeable | — |
| 5 ✅ | Tares des gastros | Fichier reçu : tares unitaires proportionnelles, capacité 40/30 par échelle, échelles 21 kg et 52 kg | — |
| 5b ✅ | Échelle sur la balance | Les 3 options sont proposées : sans échelle / échelle classique / échelle à four | — |
| 2 ✅ | Responsabilité équipe/zone | Cuisine/Production : équipe obligatoire. Réception, Stockage, Conditionnement, Plonge : responsable de zone, sans équipe | — |
| 2b ✅ | Comptes équipe hors cuisine | Oui : la perte est attribuée à la zone, l'équipe reste l'auteur de la saisie | — |
| C3 ✅ | Causes « Chutes » | « Chute » = produit tombé ; ajout de « Chutes de découpe » limitée au déboîtage | — |
| C4 ✅ | Causes du stockage | Ajoutées : péremption, rupture de la chaîne du froid, mauvaise rotation, mauvais stockage, stock excédentaire | — |
| 1 🟠 | Comptes partagés | Mot de passe par équipe géré par l'admin ; rotation à chaque départ ; révocation des sessions. Durée de session proposée : 30 jours glissants pour les comptes équipe et responsables de zone, 12 h pour les autres | Phase 1 |
| C1 ✅ | Délai des équipes | Déclaration le jour même attendue ; 7 jours maximum pour déclarer, corriger ou annuler ; au-delà, un responsable | — |
| A1 ✅ | Alerte « saisie incomplète » | 150 kg par plage dès qu'un jour de production de la plage n'a aucune déclaration (300 kg max. par semaine) ; régularisée quand tous les jours sont rattrapés dans le délai | — |
| P3 ✅ | Jours de production | Calendrier du portail : jeudi (A), vendredi (B), lundi (C), mardi (D), mercredi (E). Fériés au cas par cas : semaines normales par défaut ; ajustement dans Administration → Jours de production (réalisé le 09/11/2026) | — |
| P4 🟠 | Date de mise en service des alertes | Après les essais des équipes et la vérification du bon fonctionnement | Mise en service |
| C2 ✅ | Causes initiales | Listes reçues pour toutes les zones et chargées (26 causes, voir src/db/seed/data.ts) | — |
| P1 🔴 | Référentiel produits Phase 1 | Le référentiel est vide : les saisies se font en « hors liste ». Il faut une liste de départ (export Melba même partiel : identifiant, nom, catégorie, unité, poids unitaire si connu) | Mise en service |
| P2 🟠 | Estimation par contenant | Pour convertir « 2 gastros pleins » en kg, il faudrait un poids moyen par produit et par type de gastro. À défaut, la quantité reste en nombre de gastros (non convertie) | Phase 1–2 |
| 4 🟠 | Poids unitaires et densités | Valeurs disponibles par produit/catégorie ; sinon quantités laissées non converties | Phase 1–2 |
| 12 🟠 | Utilisateurs | Aucun prénom dans l'application : comptes nommés par fonction (« Chef d'équipe – Équipe Turquoise (H) », « Responsable Réception »). Administratrice : l'utilisatrice porteuse du projet. Restent à créer plus tard : responsable(s) de production, direction | Phase 1 |
| 6 ⚪ | Melba | Exports disponibles, identifiants stables, rendements, coûts | Phase 2 |
| 7 🟠 | Sous-recettes | Analysé (docs/INTEGRATION_OUTIL_SOUS_RECETTES.md) : notre application remplace l'outil du collègue et lira le plan de production (Google Sheet, lecture seule) et le tome Melba. Reste : export structuré ou API Melba, identifiants Melba, code Apps Script du collègue, calendrier d'import | Phase 2 |
| 3 ⚪ | Main-d'œuvre | Méthode d'imputation — désactivée tant que non définie | Phase 3 |
| 9 ⚪ | Récupération financière | Ventes à déduire du coût net | Phase 3 |
| 13 ✅ | Coûts matières | Les coûts Melba du tome sont la référence ; extraction hebdomadaire avec le prix de chaque recette et sous-recette, conservés par semaine (les plats changent chaque semaine) | Phase 3 |
| 8 🟠 | Volumes de production | Sources identifiées : « Décompte barquettes » (barquettes par code, équipe et jour, surplus, NC) et « Déboitage » (kg par barquette). Reste : mode d'accès automatique (lecture du Google Sheet par l'application ou export) | Phase 4 |
| 10 ⚪ | Facteurs carbone | Sources (ADEME / Base Empreinte) et niveau de précision | Phase 5 |
