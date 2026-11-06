# Règles métier centralisées

Chaque règle est implémentée **une seule fois** dans `src/domain/` et couverte par des tests unitaires.
Les règles marquées ⚠️ sont des hypothèses à valider (voir POINTS_A_VALIDER.md).

## R1 — Semaine de production

- Une semaine de production commence le **jeudi** et se termine le **mercredi** suivant (7 jours).
- Les semaines sont stockées **explicitement** dans la table `production_weeks` (date de début, date de fin,
  année, numéro). La semaine d'une perte est retrouvée par **recherche dans ce calendrier** à partir de la
  date réelle de la perte — jamais par la fonction ISO.
- ⚠️ **Règle de numérotation proposée pour générer le calendrier** : le numéro de la semaine de production
  est le numéro de semaine ISO **du lundi qu'elle contient** (jeudi de début + 4 jours).
  - Vérification sur l'exemple du cahier des charges : jeudi 5 novembre 2026 est en semaine ISO **45**,
    mais le lundi 9 novembre est en semaine ISO **46** → **S46** ✅ (cohérent avec l'exemple).
  - Conséquence en fin d'année : la semaine du jeudi 31/12/2026 au mercredi 06/01/2027 serait **S01-2027**.
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
3. `tare totale = Σ (nombre × tare unitaire du type)` ⚠️ (ou valeur lue dans la table « tare selon la
   quantité » si le fichier de référence le prévoit — à valider à réception du fichier).
4. `poids net = poids brut − tare totale`.
5. Si le poids net ≤ 0 → erreur bloquante (« le poids brut doit être supérieur à la tare »).
6. L'identifiant **de la version de tare** utilisée est conservé dans la déclaration.

## R4 — Répartition entre destinations

- Une déclaration a **une ou plusieurs** lignes de destination.
- Par défaut, une seule destination reçoit 100 % de la quantité (saisie en un clic).
- La somme des lignes est comparée à la quantité nette déclarée, **dans la même unité** :
  - écart nul (tolérance d'arrondi 0,001) → OK ;
  - écart non nul → alerte ; l'enregistrement exige soit une correction, soit une **justification** saisie.
- La destination ne modifie jamais la quantité de perte/surplus comptabilisée (§10.3).
- Seules les destinations marquées « récupération financière » (Too Good To Go, vente flash) peuvent porter un
  montant récupéré (Phase 3). Don et personnel : jamais de recette financière.

## R5 — Statuts et corrections

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

## R6 — Attribution à une équipe

- Compte équipe : l'équipe est préremplie et non modifiable.
- ⚠️ Chaque sous-zone porte un paramètre `team_mode` : `obligatoire`, `facultative` ou `aucune`. Une perte
  peut donc être enregistrée sans équipe (responsabilité collective / zone) lorsque la sous-zone le permet.
  Le paramétrage initial de chaque sous-zone est à valider (point 2 du cahier des charges).
- Une équipe désactivée pour une semaine n'apparaît pas dans les choix de cette semaine, mais son historique
  reste consultable.
