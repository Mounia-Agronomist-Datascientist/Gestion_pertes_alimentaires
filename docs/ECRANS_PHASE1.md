# Écrans de la Phase 1

Objectif : une déclaration complète en **moins de 30 secondes** sur téléphone, d'une seule main.
Gros boutons (≥ 48 px), choix par tuiles plutôt que par listes déroulantes quand il y a moins de 8 options,
mémorisation du dernier contexte (zone, sous-zone).

## E1 — Connexion
- Identifiant + mot de passe. Pas de création de compte libre.
- Changement de mot de passe forcé à la première connexion si demandé par l'admin.
- Session longue durée sur l'appareil (configurable) pour éviter de se reconnecter à chaque perte.

## E2 — Accueil (compte équipe)
- Bandeau à la couleur de l'équipe **avec la lettre** (« Équipe C — Rose ») — jamais la couleur seule.
- Semaine de production en cours (« S46 — jeu. 5 → mer. 11 nov. »).
- Deux gros boutons : **Déclarer une perte** / **Déclarer plusieurs pertes**.
- Résumé : nombre de déclarations de l'équipe cette semaine, dernières saisies.

## E3 — Déclaration immédiate (assistant en étapes, une étape par écran mobile)
1. **Zone** — tuiles (dernière zone utilisée en premier).
2. **Sous-zone** — tuiles filtrées par zone.
3. **Équipe** — masqué si compte équipe ; facultatif/absent selon `team_mode` de la sous-zone.
4. **Produit** — onglets par catégorie autorisée pour la zone ; recherche par nom / code / réf. Melba ;
   en Phase 1, liste issue du référentiel simple. Bouton « Produit non trouvé » → libellé libre signalé
   (à revoir par l'admin).
5. **Quantité + méthode de mesure** — méthodes proposées selon la sous-zone :
   - *Pesée* : quantité + unité (kg par défaut).
   - *Gastro* : type(s) de gastro + nombre + poids brut → affichage immédiat « Tare 2,40 kg — Net 12,60 kg ».
   - *Comptage* : nombre + unité (pièces, barquettes) → conversion affichée si poids unitaire connu,
     sinon mention « non converti en kg ».
   - *Estimation manuelle*.
6. **Cause** — liste filtrée par zone ; « Autres pertes » toujours présente ; lien « Proposer une nouvelle cause ».
7. **Destination** — une tuile = 100 % ; bouton « Répartir » pour ajouter des lignes, avec compteur
   « reste à affecter : 3,0 kg » et alerte si écart.
8. **Récapitulatif** — date réelle (aujourd'hui par défaut, modifiable → déclaration tardive signalée),
   heure facultative, commentaire facultatif → **Valider**.

Après validation : confirmation claire (coche verte + résumé) et deux boutons « Nouvelle perte (même zone) »
/ « Terminer ».

## E4 — Déclaration groupée
- En-tête commun : date, zone, sous-zone, équipe (modifiable pour tout le lot).
- Tableau de lignes ajoutées une à une (produit, quantité, méthode, cause, destination) avec la même aide
  à la saisie que E3, en format compact.
- Chaque ligne est modifiable / supprimable **avant** validation (lignes en statut `brouillon`).
- Bouton « Valider les N pertes » → toutes passent en `validee` dans une seule transaction.

## E5 — Historique
- Compte équipe : uniquement les déclarations de son équipe ; filtres semaine, zone, cause.
- Responsable de zone : déclarations de ses zones.
- Responsable production / admin / direction : toutes.
- Détail d'une déclaration : valeurs, instantanés, historique des modifications.
- Actions selon droits : **Corriger** (motif obligatoire), **Annuler** (motif obligatoire).

## E6 — Administration (ordinateur principalement)
- Équipes (couleurs, horaires, responsables, activation par semaine).
- Zones et sous-zones (ordre, `team_mode`, méthodes proposées, activation).
- Causes (par zone, activation) + **file des causes proposées** à valider/rejeter/fusionner.
- Destinations.
- Unités.
- Produits (référentiel simple, saisie manuelle — l'import arrive en Phase 2).
- Gastros et tares (versions datées).
- Calendrier des semaines de production (génération + correction).
- Comptes utilisateurs (création, réinitialisation de mot de passe, désactivation).
- Journal d'audit (consultation).
