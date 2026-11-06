# Extrait de test — semaine S45-2026

Données réelles de l'entreprise, conservées avec l'accord de l'administratrice (06/11/2026) pour tester
l'import du plan de production et du tome Melba (Phase 2). Le dépôt est privé : ne pas diffuser.

| Fichier | Source | Traitement |
|---|---|---|
| `plan-production-S45.json` | Google Sheet « Plan de production », onglet S45 (lecture seule) | Blocs utiles uniquement : plats → équipe et barquettes, petits-déjeuners, barquettes par code |
| `tome-S45.txt` | Melba « Imprimer les recettes », S45 (PDF de 107 pages) | Texte extrait ; en-têtes et pieds de page d'impression supprimés (date, lien Melba avec paramètres internes) |

Vérifié : aucun prénom ni adresse e-mail. L'onglet « Chefs d'équipe » (adresses e-mail) n'est pas repris.

Le tome raisonne en **proportions** : quantités et coûts pour une recette (une portion), comme s'il n'y avait
qu'une recette par référence. Les volumes réels viennent du plan (barquettes) et, au jour le jour, du
« Décompte barquettes ».
