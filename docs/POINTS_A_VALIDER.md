# Points à valider

Légende : 🔴 bloquant pour démarrer la Phase 1 · 🟠 nécessaire pendant la Phase 1 · ⚪ phases ultérieures.

## Décisions techniques

| # | Point | Proposition | Statut |
|---|---|---|---|
| T1 🔴 | Pile technique | Next.js + TypeScript + PostgreSQL + Drizzle (ARCHITECTURE.md §2) | À valider |
| H1 🔴 | Hébergement de production | Plateforme managée UE (app + PostgreSQL managé) | À décider |
| G1 🔴 | Dépôt GitHub | URL du dépôt (privé recommandé) à fournir | À fournir |

## Règles métier (cf. §29 du cahier des charges)

| # | Point | Proposition / hypothèse | Bloque |
|---|---|---|---|
| 11 🔴 | Numérotation des semaines | N° = semaine ISO du lundi contenu dans la semaine jeudi→mercredi (vérifié sur l'exemple S46 du 05/11/2026). Calendrier stocké en base et corrigeable | Phase 1 |
| 5 🟠 | Tares des gastros | Fichier de référence à transmettre. Question : la tare est-elle **unitaire** par type, ou le fichier donne-t-il une tare **selon le nombre** de gastros (1, 2, 3…) ? | Saisie gastro |
| 2 🟠 | Responsabilité équipe/zone | Paramètre par sous-zone : équipe obligatoire / facultative / aucune. Paramétrage initial à fournir (ex. Réception, Stockage, Plonge = facultative ?) | Phase 1 |
| 1 🟠 | Comptes partagés | Mot de passe par équipe géré par l'admin ; rotation à chaque départ ; révocation des sessions. Durée de session sur appareil ? | Phase 1 |
| C1 🟠 | Correction par une équipe | Délai pendant lequel une équipe peut corriger sa déclaration (ex. jusqu'à la fin de la semaine de production), au-delà correction par un responsable | Phase 1 |
| C2 🟠 | Causes initiales | Listes par zone : conditionnement (§9.4) et stockage (§12) fournies ; à compléter pour Réception, Cuisine, Plonge | Phase 1 |
| P1 🟠 | Référentiel produits Phase 1 | Liste minimale de démarrage (export Melba même partiel, ou saisie des ~50 références les plus fréquentes) | Phase 1 |
| 4 🟠 | Poids unitaires et densités | Valeurs disponibles par produit/catégorie ; sinon quantités laissées non converties | Phase 1–2 |
| 12 🟠 | Utilisateurs | Personnes ayant les rôles resp. de zone, production, admin, direction | Phase 1 |
| 6 ⚪ | Melba | Exports disponibles, identifiants stables, rendements, coûts | Phase 2 |
| 7 ⚪ | Sous-recettes | Outil du collègue à étudier — **aucun développement avant** | Phase 2 |
| 3 ⚪ | Main-d'œuvre | Méthode d'imputation — désactivée tant que non définie | Phase 3 |
| 9 ⚪ | Récupération financière | Ventes à déduire du coût net | Phase 3 |
| 8 ⚪ | Volumes de production | Source des dénominateurs des ratios | Phase 4 |
| 10 ⚪ | Facteurs carbone | Sources (ADEME / Base Empreinte) et niveau de précision | Phase 5 |
