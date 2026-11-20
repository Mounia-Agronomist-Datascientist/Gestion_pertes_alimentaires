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
9. Les tares sont **datées** (Administration → Gastros et tares) : une nouvelle tare s'applique à partir d'une
   date postérieure à la dernière version, la précédente est clôturée la veille. Une tare qui a servi n'est
   jamais réécrite ; une tare jamais utilisée peut être corrigée à la même date (erreur de saisie). Les pertes
   déjà enregistrées gardent la tare de l'époque ; une correction ultérieure utilise la tare en vigueur à la
   date de la perte.

## R4 — Répartition entre destinations

- Une déclaration a **une ou plusieurs** lignes de destination.
- Par défaut, une seule destination reçoit 100 % de la quantité (saisie en un clic).
- La somme des lignes est comparée à la quantité nette déclarée, **dans la même unité** :
  - écart nul (tolérance d'arrondi 0,001) → OK ;
  - écart non nul → alerte ; l'enregistrement exige soit une correction, soit une **justification** saisie.
- La destination ne modifie jamais la quantité de perte/surplus comptabilisée (§10.3), **sauf le retour fournisseur**
  (R27, 19/11/2026) : la part renvoyée sort du total perdu et est comptée à part.
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
- Délai pour **déclarer** : **7 jours** après la date de la perte.
- Délai pour **corriger ou annuler** : jusqu'à **une semaine après la fin de la semaine de production** de la perte
  (mercredi + 7 jours ; décision du 17/11/2026).
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
  vendredi, lundi, mardi, mercredi, notés A à E comme sur le calendrier du portail). Les jours fériés sont
  traités au cas par cas par l'entreprise : l'administration retire un jour non travaillé ou ajoute un samedi
  travaillé dans *Administration → Jours de production* (modification tracée dans le journal d'audit).
- Le lendemain du dernier jour d'une plage, chaque équipe active dont **au moins un jour de production de la
  plage n'a aucune déclaration** reçoit une **perte estimée de 150 kg** pour la plage (une seule fois, quel que
  soit le nombre de jours manquants ; confirmé le 09/11/2026). Une semaine sans rien : 2 × 150 kg = 300 kg.
  Les jours manquants sont affichés à l'équipe.
- Comptent : les pertes attribuées à l'équipe et celles saisies par son compte (même hors cuisine), non annulées.
- Quand **tous** les jours manquants ont été renseignés dans le délai de 7 jours, l'alerte est **régularisée**
  (l'estimation n'est plus comptée, l'alerte reste dans l'historique) ; un rattrapage partiel met seulement
  à jour la liste des jours manquants. L'administration ou la production peut **lever** une alerte avec motif.
- L'estimation est toujours comptée **à part** des pertes déclarées dans les statistiques.
- Visible par l'administratrice et le responsable de production (toutes les équipes) et par chaque équipe (les siennes).
- Mise en service : variable `ALERTES_DEBUT` (aucune plage antérieure n'est contrôlée). Évaluation à chaque
  affichage de l'accueil et par la tâche quotidienne `npm run alertes:evaluer` (à planifier vers 22h).

## R9 — Encas (validé le 09/11/2026)

- Les encas sont les recettes du tome dont le code commence par `EN` (`EN01_EQ`, `EN07_FB`…). Ils ne figurent
  pas dans le plan de production : ils n'appartiennent à aucune équipe de cuisine.
- Ils sont proposés **uniquement** dans les zones **Conditionnement**, **Réception** et **Stockage** ; jamais
  aux équipes de cuisine.
- À l'import, leur absence du plan est normale : elle n'est pas signalée comme une anomalie.

## R10 — Produits de la semaine (validé le 10/11/2026)

- Le poids d'une recette dans Melba est celui de tous ses ingrédients après cuisson pour **une portion**, sans la
  barquette : une barquette perdue = une portion. Une portion de plat pèse toujours entre **300 et 380 g** (un
  écart est signalé à l'import) ; un petit-déjeuner (`PJ`) peut peser moins.
- Les **moules et plats à gratin** listés dans le tome (« Moule rond biodeg », « Petit plat à gratin format
  individuel »…) forment la catégorie **« Moules et plats à gratin »** : ils ne sont jamais convertis en kg
  alimentaires et ne se pèsent pas en gastros.
- Plats proposés à la saisie : les postes de cuisine voient les plats de **leur équipe** ; le **Conditionnement
  voit tous les plats** de la semaine et les encas ; Réception et Stockage voient les encas (R9).

## R11 — Coût matière d'une perte (Phase 2, 10/11/2026)

- Référence : les coûts du **tome Melba de la semaine de la perte**, figés sur la déclaration à la saisie.
- Plat ou encas : coût de la portion ; sous-recette : coût des ingrédients rapporté au poids net après cuisson ;
  ingrédient : coût de sa ligne rapporté à sa quantité.
- Coût estimé = poids net × coût au kg, sinon nombre × coût unitaire ; aucun coût n'est inventé pour un produit
  du référentiel ou hors liste. Les règles de valorisation complètes (ventes, destinations) relèvent de la Phase 3.

## R12 — Coût brut d'une perte (Phase 3, 10/11/2026)

- Coût brut = matières + emballages (+ main-d'œuvre et charges indirectes quand elles seront définies).
- Les moules et plats à gratin inclus dans le coût Melba d'un plat sont comptés en **emballages**, jamais deux fois.
- Les emballages du référentiel s'ajoutent à **tout plat perdu** (par portion), aux prix en vigueur à la date de
  la perte ; aucun emballage n'est ajouté aux encas, sous-recettes et ingrédients.
- Le coût est figé sur la déclaration avec sa méthode et sa date de calcul.

## R13 — Recettes encaissées et coût net (Phase 3, 10/11/2026)

- Seules les destinations de **vente** (Too Good To Go, vente flash) portent une recette : le **montant réellement
  encaissé**, saisi à la déclaration ou complété plus tard (nouvelle version tracée).
- Coût net = coût brut − recettes encaissées ; brut et net restent consultables séparément.

## R14 — Périodes et périmètre des statistiques (Phase 4, 10/11/2026)

- **Semaine** et **année** : calendrier de production stocké (une année = ses semaines S01 à S52/S53).
  **Mois** et **période libre** (un an au plus) : date réelle de la perte. Une semaine à cheval sur deux mois est
  donc répartie entre ces mois selon la date de chaque perte.
- Période précédente (évolution) : la semaine d'avant dans le calendrier, le mois ou l'année d'avant, ou la même
  durée juste avant une période libre.
- Comptées : déclarations validées ou corrigées (dernière version et ses destinations) ; jamais les annulées.
- Kg alimentaires et unités d'emballage (consommables, moules) ne sont jamais additionnés ; une perte alimentaire
  non convertie en kg est comptée à part.
- Périmètre : une équipe ses pertes, un responsable de zone ses zones ; production, direction et administration
  toute l'entreprise. Les euros (coûts figés sur chaque perte) seulement pour les profils « indicateurs économiques ».

## R15 — Volume de production (Phase 4, 12/11/2026)

- **Prévu** : barquettes par code du plan de production importé (import en vigueur de la semaine).
- **Réel** : colonne « Ma production » de l'onglet « Semaine NN » du « Décompte barquettes », déposé chaque semaine
  (Administration → Import) ; l'année de la semaine est celle des onglets des jours (« 2026 S45A Jeudi »).
- Kg produits = barquettes × poids d'une portion du tome Melba de la semaine ; un code sans poids n'entre pas dans
  les kg (signalé).
- Par équipe : codes attribués à l'équipe par le plan de la semaine.
- Sans plan ou sans décompte, le volume correspondant n'existe pas : aucun ratio n'est calculé ni estimé.

## R16 — Nom affiché d'un plat (12/11/2026)

Partout dans l'application (saisie, historique, détail, statistiques, import), un plat de la semaine s'affiche
avec son code Melba devant son nom : « VI04_Ragoût de porc ». Le nom enregistré sur la perte ne change pas.

## R17 — N° de poubelle des Alchimistes (12/11/2026)

- Chaque destination a un réglage « N° de poubelle à chaque perte » (Administration → Destinations) :
  **non demandé**, **facultatif** ou **obligatoire**. Quand il est demandé, la saisie propose le **n° de la
  poubelle** où la perte est jetée (20 caractères au plus).
- **Les Alchimistes : facultatif** depuis le 12/11/2026, en attendant que leur fichier donne les n° des bacs
  collectés. Il repassera en obligatoire dans l'administration, sans changement de code.
- La case est **préremplie** avec le dernier n° noté dans la même zone (pertes non annulées) : on ne la change
  qu'au changement de poubelle. En mode obligatoire, la perte ne peut pas être validée sans n°.
- Le n° est gardé à chaque nouvelle version (correction, annulation, recette, rattachement) ; il servira au
  rapprochement avec les pesées des Alchimistes (Phase 5).

## R18 — Ventes et dons des surplus de barquettes (13/11 et 16/11/2026)

- Les fichiers de l'entreprise **font foi** : « VENTES TGTG », « VENTES FLASH » et « Gestion des surplus barquettes
  pour association Linkee », déposés en Excel (Administration → Import). Too Good To Go, la vente flash et Linkee
  ne sont plus proposés aux équipes à la saisie (réglage « Proposée aux équipes » d'Administration →
  Destinations) ; une déclaration passée qui les porte peut toujours être corrigée.
- **Linkee** : destination à part, de type don, sans recette.
- **Too Good To Go** : « CA TGTG » = prix payé par les clients ; « RESULTAT REEL » (en rouge) = versement reçu,
  **HT après commission**, compté à sa date (il couvre les ventes précédentes).
- **Vente flash** : montant = chiffre d'affaires **TTC**. « 41 dt 18 avec PDJ » = 41 boxes de 10 barquettes, dont
  18 avec 5 barquettes de petit-déjeuner (vendues 10 € de plus) ; « 70 (dont 22 x 2box) » = 70 boxes dont 22 achats
  de deux boxes, déjà comptés dans les 70. Le nombre de barquettes par box vient de la formule (« 10P », « 12P »).
- Les montants des trois sources **ne s'additionnent jamais** : leurs bases diffèrent.
- **Coût Linkee** : le n° de lot donne la date de production et le code plat (« L41-071026-L2-VI01 ») ; coût
  matières = barquettes × coût Melba d'une portion, kg = barquettes × poids d'une portion, d'après l'import Melba en
  vigueur de la semaine de production (à défaut de date lisible : n° de semaine du lot). Figés au dépôt. Plat non
  retrouvé ou produit hors Melba (yaourts) : barquettes comptées, sans kg ni coût.
- Un fichier redéposé remplace les lignes en vigueur de sa source sur sa période ; les anciennes restent en base.
  Les contacts du fichier Linkee ne sont jamais lus.

## R19 — Tendance des pertes (Phase 6, 16/11/2026)

- **Moyenne glissante** d'une semaine de production : moyenne de cette semaine et des 3 précédentes, sur les
  valeurs connues (au moins 2).
- **Sens de la tendance** : moyenne des 4 dernières semaines (semaine choisie comprise) comparée à celle des
  4 semaines d'avant. **Stable** sous 10 % d'écart (réglable), sinon **en hausse** ou **en baisse** ; toujours écrit avec
  son symbole (▲, =, ▼), jamais par la seule couleur.
- Les semaines d'avant la première perte enregistrée de la série ne comptent pas.
- Indicateurs : kg de pertes alimentaires, kg pour 1 000 barquettes prévues et produites, coût net (euros réservés
  aux profils « indicateurs économiques »).

## R20 — Pertes inhabituelles (Phase 6, 16/11/2026)

- Calculées la nuit pour chaque **semaine de production terminée**, par **équipe**, **zone** et **plat**.
- Alerte quand les pertes de la semaine dépassent d'au moins **50 %** la moyenne des **4 semaines précédentes**
  où l'unité était concernée (il en faut au moins 2), et jamais sous **5 kg** dans la semaine.
- **À volume égal** (kg pour 1 000 barquettes produites, « Décompte barquettes ») quand la production de la semaine
  et d'au moins 2 semaines de référence est connue ; sinon en kg. Volume d'une équipe : ses plats d'après le plan ;
  d'une zone : toute l'entreprise ; d'un plat : son code.
- Semaines de référence : après la mise en service (`ALERTES_DEBUT`), équipe active, plat au plan ou au décompte.
- Les seuils sont enregistrés en base (`alert_settings`) et réglables dans Administration → Seuils des alertes.
- Visibilité : production, administration et direction voient toutes les alertes ; un responsable de zone celles
  de ses zones ; une équipe la sienne et celles de ses plats. « Vu » se note par compte.

## R21 — Causes récurrentes (Phase 6, 16/11/2026)

- Calculées la nuit pour chaque semaine de production terminée, par **équipe** et par **plat**.
- **Cause en tête** d'une semaine : la plus lourde en kg de pertes alimentaires, puis la plus fréquente ; pas de
  cause en tête en cas d'égalité parfaite.
- Alerte quand la **même cause est en tête 3 semaines de suite** : semaines consécutives pour une équipe (une
  semaine sans perte interrompt la série), dernières semaines de production pour un plat.
- Seulement des semaines postérieures à la mise en service (`ALERTES_DEBUT`). Le nombre de semaines est réglable
  (`alert_settings`).

## R22 — Pertes saisies sans réseau (Phase 6, 17/11/2026)

- Une perte validée sans réseau est **gardée sur l'appareil** puis envoyée automatiquement ; elle ne compte dans
  l'historique, les statistiques et les alertes qu'une fois reçue.
- Le **délai de 7 jours** des équipes se compte depuis l'**heure de saisie** sur l'appareil. L'heure de réception
  est gardée quand la perte arrive plus d'une minute après.
- Refus à la réception : heure de saisie en avance de plus de 5 minutes sur le serveur ; pour une équipe, saisie
  datant de plus de 7 jours. Une perte refusée reste sur l'appareil avec le motif.
- Une même perte reçue deux fois n'est enregistrée qu'une fois (identifiant créé sur l'appareil).
- Sans réseau, seule la déclaration est possible (une perte ou une série) ; corrections, historique, statistiques
  et administration restent en ligne.
- Sans réseau, l'appareil ouvre la **dernière version reçue** des pages de saisie, avec les listes de la semaine de
  ce moment. Si elles datent d'un jour précédent, la date de la perte est celle de l'appareil et un avertissement
  s'affiche. Ces pages sont effacées à la déconnexion.


## R23 — Prix des matières premières (Phase 6, 17/11/2026)

- Chaque ingrédient des tomes Melba est une matière du référentiel ; ses prix sont des **versions datées**, jamais
  modifiées après coup.
- Un nouveau tome crée une version quand le prix ou l'unité change (écart d'au moins 0,5 %, en dessous c'est
  l'arrondi du tome) ; la version commence le premier jour de la semaine de production du tome.
- Prix retenu pour une perte : le **dernier prix d'achat** (bon de commande) ou la dernière correction manuelle en
  vigueur à la date de la perte, à défaut le **coût du tome**. Il est figé sur la déclaration.
- Un import ne change jamais le nom, l'état ni les réglages faits à la main.
- Prix d'achat (bons de commande, 18/11/2026) : daté du **jour de livraison** ; ramené au kg (prix au kg, ou prix du
  colis ÷ son poids) ou à la pièce ; un prix au litre est ramené au kg avec la densité de la matière (R24), jamais
  calculé sans densité ni pour une unité qui ne correspond pas au conditionnement. Deux bons livrés le même jour :
  le dernier déposé fait foi. Un bon redéposé remplace ses prix.
- Le coût du tome **compte la préparation** (réponse du 18/11/2026) : perte à l'épluchage ou au parage, gain des
  féculents qui gonflent. Un écart entre le tome et le prix d'achat n'est donc pas forcément un changement de prix.
  Une matière perdue telle qu'achetée (Réception, Stockage) prend le prix d'achat ; un ingrédient de la semaine
  choisi dans un plat garde le coût du tome.

## R24 — Densités des liquides (Phase 6, 18/11/2026)

- Tableau de référence fourni le 18/11/2026 (huiles : Codex Alimentarius CXS 210 et FAO ; autres liquides : eau,
  laits, crème liquide, jus, vinaigres, sauce soja, sirops, miel, mélasse), en kg/L à 20 °C ; valeur retenue : le
  **milieu de la plage** (src/domain/densites.ts).
- Rattachement par le nom de la matière : liquides du tableau, et aussi **au plus proche** (mélange d'huiles =
  moyenne des huiles, lait demi-écrémé = moyenne entier/écrémé, toute sauce soja = sauce soja, tout vinaigre autre
  que balsamique = vinaigre blanc, eau de cuisson = eau). Sans correspondance (lait de coco, jus de citron, crème
  épaisse…) : pas de densité.
- Donnée à une matière **qui n'en a pas** (import du tome, dépôt des bons, « Compléter depuis les tomes importés ») ;
  une densité saisie à la main n'est jamais remplacée. Administration → Produits indique l'origine d'une densité de
  référence.
- Sert à convertir en kg une perte saisie en litres (matière de la liste ou ingrédient de la semaine) et à ramener
  au kg un prix d'achat au litre.

## R28 — Produit absent de la liste : types et prix (Phase 6, 20/11/2026)

- En **Stockage**, un produit absent de la liste est une **matière première** ou un **encas** (les sous-recettes,
  recettes, produits finis, consommables et plats à gratin concernent la cuisine et le conditionnement). Le serveur
  refuse les autres types dans cette zone.
- « Produit externe » s'appelle désormais **« Encas »** partout.
- **Prix d'achat** facultatif (HT, au kg ou à la pièce) : à la saisie, la perte est chiffrée tout de suite (poids ou
  nombre × prix) ; après coup, Administration → Produits → saisies « hors liste » : « Indiquer le prix » chiffre
  toutes les saisies du même nom (nouvelle version de chaque perte, motif gardé dans l'historique).
- Rattachement à un produit de la liste, ou création du produit (avec un prix facultatif, daté de la plus ancienne
  saisie) : le coût est recalculé au prix du produit en vigueur à la date de chaque perte ; sans prix du produit, le
  prix indiqué est gardé.


## R29 — Liste des encas, quelle que soit la semaine (Phase 6, 20/11/2026)

- Les encas restent longtemps en stock : en **Réception, Stockage et Conditionnement** (règle R9), l'étape « Quel
  produit ? » propose, après les encas de la semaine du tome, **« Tous les encas »**, rangés par famille (Fromages,
  Crackers, Yaourts…). Ailleurs, un encas n'est ni proposé ni accepté par le serveur.
- Liste de départ : les 99 encas commandés en 2026 (relevé du 20/11/2026), avec leur prix d'achat HT daté du jour
  de livraison (une version à chaque changement de prix) et le poids d'une unité quand le bon le donne
  (migration 0032). Une pièce = l'unité du prix du bon (sachet, pot, assiette, lot de 4 yaourts…).
- Nouveaux encas : une ligne de bon de commande classée **« ENCAS »** par Melba crée un encas ; l'administration peut
  aussi passer un produit en type « Encas » et lui donner sa famille (fiche produit).
- Sans poids d'une unité (smoothies, yaourts « J'achète » vendus au yaourt, granola, mélange Mississipi, noix de
  cajou Kreeks, Saint-Nectaire en portion, amandes torréfiées FR), le comptage en pièces n'est pas proposé en
  Réception et en Stockage (règle R25) tant que le poids n'est pas complété sur la fiche produit.
## R27 — Retours fournisseur et devenirs de la Réception (Phase 6, 19/11/2026)

- Une perte (ou la part d'une perte) **renvoyée au fournisseur** n'est **pas comptée dans le total perdu** : ni kg, ni
  euros, ni cases par zone, classements, ratios, alertes ou coûts des pertes. Elle repart et un avoir est attendu.
- Elle est donnée **à part** : « Retours fournisseur (hors pertes) » dans la vue générale et la synthèse de la semaine
  (kg, coût brut, nombre), et une ligne « + retours fournisseur » dans la case de la zone. Valorisation : toujours dans
  le groupe « à part ».
- Perte répartie (ex. 3 kg renvoyés, 2 kg au compost) : coupée au prorata des quantités de chaque destination.
- Devenir **« Retour fournisseur »** proposé seulement en **Réception** ; **« Réutilisation dans une autre préparation »**
  n'est pas proposée en Réception. Le serveur refait le contrôle (une correction garde un devenir déjà saisi).
- **« Autre destination »** demande un commentaire qui la précise (comme le motif « Autres pertes »).
- **Matières de la semaine complètes** : fournisseur et poids du colis lus dans les bons (contenu en sous-colis pesés,
  « 4 Sac 2,5kg » ; colis imbriqué, « Palette (80 Carton (10KG)) » ; pièces avec le poids écrit dans le nom du produit,
  « Escalope de dinde 120g »). Si l'intitulé et le contenu donnent deux poids différents, rien n'est retenu. Ce qui
  manque est listé dans Administration → « Matières à compléter » et se saisit sur la fiche produit ; le dernier colis
  de chaque fournisseur reste valable d'une semaine à l'autre, jusqu'à un bon qui le change. Stocks tampons (palettes
  pour plusieurs semaines) : l'information vient du bon le plus récent qui contient la matière, quelle que soit sa
  semaine. Vendu au poids : libellé « kg », « (KG) » ou « g ».
- **Eau du robinet** (« eau », « eau au poids » du tome) : jamais proposée parmi les matières de la semaine ni à
  compléter, car elle n'est pas livrée par un fournisseur.

## R26 — Zones de chaque compte (Phase 6, 19/11/2026)

- Chaque compte a des **zones cochées** (Administration → Comptes) : il ne saisit des pertes et ne voit les résultats
  (historique, statistiques) que de ces zones. Toutes les zones restent affichées à la saisie, les autres grisées.
- Une **équipe** voit ses propres pertes dans ses zones (pas celles des autres équipes) ; les profils qui comparent les
  équipes voient toutes les équipes, dans leurs zones.
- Par défaut : équipe → Cuisine/production ; responsable de zone → zones choisies ; production, administration,
  direction → toutes les zones. Au moins une zone par compte.
- Une perte d'une zone décochée reste en base et dans les résultats des autres comptes ; elle n'est plus visible ni
  corrigeable par ce compte.

## R25 — Façons de mesurer selon le lieu (Phase 6, 18/11/2026)

- **Partout** : kg (ou g) et unités du produit (pièces, converties avec le poids d'une pièce : « 10 hauts de cuisse
  à 120 g ») ; litres pour un liquide (densité, R24).
- **Gastros et contenants** (estimation par contenant, pesée dans des gastros) : seulement en **Cuisine** (dont le
  Déboîtage) et en **Conditionnement**.
- **Barquettes** : seulement en **Conditionnement** (et un futur poste de post-conditionnement de cette zone). En
  cuisine, un plat perdu se compte en pièces : une pièce = une portion (R10), comptée aussi dans les « barquettes
  perdues » des statistiques.
- **Colis du fournisseur** (« sachet de 2 kg », « Bouteille 64 cl ») : seulement en **Réception** et en **Stockage**,
  pour une matière du référentiel. Poids du colis lu dans le dernier bon de chaque fournisseur ou saisi à la main
  (fiche produit) : contenu en kg ou g, en volume avec la densité, en pièces avec le poids d'une pièce ; sinon le
  colis n'est pas proposé. « (KG) » est un produit vendu au kg, pas un colis. Le colis utilisé est gardé sur la
  perte.
- **Pièces en Réception et en Stockage** : proposées seulement si le poids d'une pièce est connu (jamais de perte à
  0 kg) ; un consommable se compte toujours en pièces.
- **Coût** : poids total × prix au kg en vigueur à la date de la perte (R23), affiché pendant la saisie.
- Le serveur refait le contrôle : une unité non permise dans le lieu est refusée, aussi pour une correction.
- **Réception (19/11/2026)** : un seul poste, « Réception des marchandises » (« Contrôle des marchandises » désactivé,
  migration 0030). Façons de mesurer, dans cet ordre : « 1. Comptage en nombre de colis, sachets ou unités »,
  « 2. Pesée à la balance », « 3. Estimation » ; poids en **kg** seulement (ni g ni mL). Matières des semaines S-1, S
  et **S+1** (les bons de la semaine suivante arrivent dès le jeudi).
- **Stockage (19/11/2026)** : mêmes façons de mesurer qu'en Réception, dans le même ordre et avec les mêmes noms
  (« 1. Comptage en nombre de colis, sachets ou unités », « 2. Pesée à la balance », « 3. Estimation ») ; poids en **kg**
  seulement (ni g ni mL). Matières des semaines S-1 et S.
- **Poids du colis modifiable** (Réception, Stockage) : le poids du colis choisi est prérempli et se corrige à la saisie
  (cartons de 2 kg reçus au lieu de 3 kg ; la perte garde « reçu : 2 kg au lieu de 3 kg ») ; « Autre colis » quand
  aucun colis n'est connu, avec son poids. Le colis est donc toujours proposé en Réception et en Stockage.

