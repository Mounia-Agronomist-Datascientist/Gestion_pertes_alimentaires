# Règles métier centralisées

Chaque règle est implémentée **une seule fois** dans `src/domain/` et couverte par des tests unitaires.
Les règles marquées ⚠️ sont des hypothèses à valider (voir POINTS_A_VALIDER.md).

## R1 — Semaine de production

- Une semaine de production commence le **jeudi** et se termine le **mercredi** suivant (7 jours).
- Les semaines sont stockées **explicitement** dans la table `production_weeks` (date de début, date de fin,
  année, numéro). La semaine d'une perte est retrouvée par **recherche dans ce calendrier** à partir de la
  date réelle de la perte — jamais par la fonction ISO.
- ✅ **Règle de numérotation validée (06/11/2026)** : le numéro et l'année de la semaine de production sont
  ceux de la semaine ISO **du lundi qu'elle contient** (jeudi de début + 4 jours).
  - Conséquence : **S01-2026 a commencé le jeudi 25/12/2025** (elle contient le lundi 29/12/2025,
    premier jour de la semaine ISO 1 de 2026) ⚠️ à confirmer avec le calendrier du portail.
  - Jeudi 5 novembre 2026 : semaine ISO 45, mais le lundi 9 novembre est en ISO 46 → **S46-2026** ✅.
  - Jeudi 24/12/2026 → mercredi 30/12/2026 : **S53-2026** ✅ (2026 compte 53 semaines ISO).
  - Jeudi 31/12/2026 → mercredi 06/01/2027 : **S01-2027** ✅.
  - Référence de l'entreprise : calendrier des jours de production du portail interne La Brigade
    (`/apps/calendrier-jours-production`). En cas de divergence, c'est ce calendrier qui fait foi.
- L'administrateur peut corriger une semaine du calendrier (avec journalisation) ; le générateur ne sert
  qu'à pré-remplir.
- Déclaration tardive : `declared_at` (horodatage de saisie) appartient à une semaine postérieure à la
  semaine de production de la perte → la déclaration est marquée `is_late = true`. La date réelle n'est
  jamais modifiée.

## R2 — Unités et conversion en kilogrammes

| Unité saisie | Conversion en kg | Si l'information manque |
|---|---|---|
| kg | × 1 | — |
| g | ÷ 1000 | — |
| L, mL | × densité (kg/L) du produit, sinon de sa catégorie | Non converti, signalé |
| pièce, barquette, contenant | × poids unitaire (kg) du produit | Non converti, signalé |
| gastro | via la règle R3 (pesée brute − tare) | — |

- **Jamais** 1 L = 1 kg par défaut. **Jamais** de poids unitaire ou de densité inventés.
- Une quantité non convertible est conservée dans son unité d'origine avec `kg_status = 'non_converti'`.
- Les consommables/emballages sont comptés dans **leur unité** et ne sont **jamais** additionnés aux kg
  alimentaires.
- Le poids unitaire et la densité utilisés sont recopiés dans la déclaration (instantané).

## R3 — Tares des gastros

1. L'utilisateur choisit un ou plusieurs types de gastro et leur nombre.
2. Il saisit le poids brut total mesuré.
3. ✅ Le fichier de référence (« Multiplication des gastros ») est **strictement proportionnel** :
   `tare d'un type = nombre × tare unitaire du type`. Tares unitaires : Gastro 1 (fin) 1,10 kg ;
   1TR (fin à trous) 1,15 kg ; 2 (moyen) 1,25 kg ; 2TR (moyen à trous) 1,30 kg ; 3 (moyen profond) 1,75 kg ;
   4 (profond) 2,25 kg.
4. Le nombre de gastros d'un type est limité à la capacité de l'échelle indiquée dans le fichier
   (40 pour les gastros 1 et 1TR, 30 pour les autres) ; au-delà, la saisie est refusée.
5. Si les gastros sont pesés **sur leur échelle**, la tare de l'échelle est ajoutée : échelle classique 21 kg,
   échelle à four 52 kg (valeurs du même fichier). Au plus une échelle par pesée.
6. `tare totale = tare de l'échelle éventuelle + Σ tares des types` ; `poids net = poids brut − tare totale`.
7. Si le poids net ≤ 0 → erreur bloquante (« le poids brut doit être supérieur à la tare »).
8. L'identifiant **de la version de tare** utilisée est conservé dans la déclaration.

## R4 — Répartition entre destinations

- Une déclaration a **une ou plusieurs** lignes de destination.
- Par défaut, une seule destination reçoit 100 % de la quantité (saisie en un clic).
- La somme des lignes est comparée à la quantité nette déclarée, **dans la même unité** :
  - écart nul (tolérance d'arrondi 0,001) → OK ;
  - écart non nul → alerte ; l'enregistrement exige soit une correction, soit une **justification** saisie.
- La destination ne modifie jamais la quantité de perte/surplus comptabilisée (§10.3).
- Seules les destinations marquées « récupération financière » (Too Good To Go, vente flash) peuvent porter un
  montant récupéré (Phase 3). Don et personnel : jamais de recette financière.

## R5 — Historisation et traçabilité

Toutes les saisies sont conservées pour la traçabilité et le suivi des performances dans le temps :

- **Rien n'est jamais supprimé** : ni déclaration, ni équipe, ni zone, ni cause, ni tare (désactivation seulement).
- Chaque déclaration garde sa date réelle, sa date de saisie, son auteur et un **instantané** des données
  utilisées (nom et référence du produit, tare, densité, poids unitaire, coûts en Phase 3).
- Chaque modification crée une **nouvelle version** complète de la déclaration (table `declaration_revisions`) :
  on peut afficher l'état exact d'une déclaration à n'importe quelle date et savoir qui a changé quoi, quand
  et pourquoi.
- Toute action sensible (connexion, saisie, correction, annulation, modification de référentiel, de compte
  ou de tare) est inscrite dans le journal d'audit, en insertion seule.
- Les statistiques historiques ne sont jamais recalculées silencieusement avec de nouveaux prix ou de
  nouvelles tares.

## R5 bis — Délai de déclaration des équipes (validé le 06/11/2026)

- Les équipes doivent déclarer leurs pertes **le jour même**. Le nombre de jours entre la perte et sa saisie
  est affiché (« Saisie le jour même », « Saisie 2 jours après la perte »).
- Délai maximal : **7 jours** après la date de la perte, pour déclarer comme pour corriger ou annuler.
  Au-delà, seul un responsable (zone, production, administrateur) peut le faire.
- Alerte « rien de noté » : voir R8.

## R6 — Statuts et corrections

```
brouillon ──valider──▶ validée ──corriger──▶ corrigée ──corriger──▶ corrigée …
                          │                       │
                          └──────annuler──────────┴──▶ annulée
```

- Aucune suppression physique. Une déclaration annulée reste visible pour les profils autorisés et est
  exclue des statistiques.
- Chaque correction crée une entrée d'audit avec valeur avant / après, auteur, date, motif (motif obligatoire
  après validation).
- Les coûts et références stockés dans une déclaration ne sont **jamais** recalculés automatiquement.

## R7 — Attribution à une équipe

- Responsables (validé le 06/11/2026) :
  - Réception, Stockage, Conditionnement, Plonge : **un responsable par zone** (compte « responsable de zone ») ;
  - Cuisine / Production : **un responsable par équipe**, le chef d'équipe (compte équipe). Les 8 équipes sont
    indépendantes et gèrent leurs propres pertes dans toutes les sous-zones où elles interviennent.
- Compte équipe : l'équipe est préremplie et non modifiable.
- Un compte équipe peut aussi déclarer une perte constatée hors cuisine (ex. au conditionnement) ; elle est
  alors attribuée à la zone, et l'équipe reste enregistrée comme auteur de la saisie.
- ✅ Chaque sous-zone porte un paramètre `team_mode` (validé le 06/11/2026) :
  - `equipe` — Cuisine / Production (déboîtage → salle blanche) : la perte est attribuée à l'une des 8 équipes ;
  - `zone` — Réception, Stockage, Conditionnement, Plonge : la perte est attribuée à la zone et à son
    responsable unique, sans équipe.
- Une équipe désactivée pour une semaine n'apparaît pas dans les choix de cette semaine, mais son historique
  reste consultable.

## R8 — Plages de réutilisation et alerte « rien de noté » (validé le 06/11/2026)

- On produit chaque jour ; les surplus peuvent être réutilisés d'un jour à l'autre, **sauf après le vendredi**
  (DLC trop courte pour le lundi) et **après le mercredi** (le lendemain commence une nouvelle semaine).
- Chaque semaine de production a donc deux **plages** : jeudi → vendredi (un samedi travaillé y est rattaché)
  et lundi → mercredi. Les jours de production viennent de la table `production_days` (pré-remplie jeudi,
  vendredi, lundi, mardi, mercredi ; à aligner sur le calendrier du portail : fériés, samedis).
- Le lendemain du dernier jour d'une plage, chaque équipe active **sans aucune déclaration** sur la plage
  reçoit une **perte estimée de 150 kg** (valeur conservée dans l'alerte). Une semaine sans rien : 2 × 150 kg.
- Comptent : les pertes attribuées à l'équipe et celles saisies par son compte (même hors cuisine), non annulées.
- Une perte déclarée ensuite dans le délai de 7 jours **régularise** l'alerte (l'estimation n'est plus comptée,
  l'alerte reste dans l'historique). L'administration ou la production peut **lever** une alerte avec motif.
- L'estimation est toujours comptée **à part** des pertes déclarées dans les statistiques.
- Visible par l'administratrice et le responsable de production (toutes les équipes) et par chaque équipe (les siennes).
- Mise en service : variable `ALERTES_DEBUT` (aucune plage antérieure n'est contrôlée). Évaluation à chaque
  affichage de l'accueil et par la tâche quotidienne `npm run alertes:evaluer` (à planifier vers 22h).
