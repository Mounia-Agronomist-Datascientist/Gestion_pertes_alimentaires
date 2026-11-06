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
3. ✅ La tare **n'est pas proportionnelle** : le référentiel donne, pour chaque type de gastro, la tare
   **selon le nombre de gastros** (table type × nombre → tare totale). Pour chaque type :
   `tare du type = valeur lue dans la table pour (type, nombre)` ; `tare totale = Σ tares des types`.
   ⚠️ Comportement si le nombre saisi dépasse la table : à définir à réception du fichier
   (proposition : refus avec message, pas d'extrapolation).
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
