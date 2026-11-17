# Phase 6 — Optimisation et automatisation

Objectif (cahier des charges §26, phase 6) : rendre l'outil plus efficace. Le cahier des charges donne des
**pistes**, pas une liste figée. Chaque piste est analysée ici. Celles retenues seront développées une par une,
comme les phases précédentes, après validation.

## Analyse des pistes (16/11/2026)

| # | Piste | Ce qui existe déjà | Ce qu'il faudrait | Décision attendue |
|---|---|---|---|---|
| 1 | **Connexion API Melba** | Le tome Melba (PDF « Imprimer les recettes ») est déposé chaque semaine et lu par l'application. | Une API Melba : documentation, identifiants, droit d'accès. Rien n'est connu à ce jour (point 6 de POINTS_A_VALIDER). | Existe-t-il un accès API Melba pour l'entreprise ? |
| 2 | **Automatisation des imports** | Dépôts manuels avec aperçu : tome + plan de production, « Décompte barquettes », Alchimistes, TGTG, ventes flash, Linkee. | Lecture directe des Google Sheets par un **compte de service Google**, en lecture seule. Chaque fichier doit être partagé avec ce compte, y compris le plan de production qui appartient à un autre service : son propriétaire doit l'accepter. Aucun fichier n'est jamais modifié. Les Alchimistes n'ont pas d'accès automatique connu. | Les propriétaires des fichiers acceptent-ils ce partage ? |
| 3 | **Alertes sur les pertes inhabituelles** | Alerte « rien de noté » (Phase 1, règle R8), tâche de nuit sur GitHub. Comparaisons semaine / moyenne 4 semaines / an passé (Phase 4). | Une règle : par exemple, une équipe ou un plat dont les kg (ou les kg pour 1 000 barquettes) dépassent de X % la moyenne des 4 semaines précédentes. Seuils à fixer par vous, réglables dans l'administration. Affichage à l'accueil des responsables ; courriel en option. | Seuils et destinataires. |
| 4 | **Alertes sur les causes récurrentes** | Classement des causes (Phase 4). | Une règle : par exemple, la même cause N fois en M semaines pour une équipe ou un plat. | N, M et destinataires. |
| 5 | **Suivi des objectifs** | Rien. | Objectifs datés, saisis par l'administration (par exemple : kg pour 1 000 barquettes, coût net, part valorisée), pour l'entreprise ou par équipe ; écart affiché dans les statistiques et les rapports. | Indicateurs, niveaux (entreprise, équipe) et valeurs. |
| 6 | **Analyse de tendances** | Évolution sur 12 semaines, 12 mois, années (Phase 4). | Moyenne glissante et sens de la tendance (hausse, stable, baisse) sur les indicateurs principaux. Calcul simple, sans règle métier nouvelle. | Validation de la méthode. |
| 7 | **Lots et dates de péremption** | Les n° de lot (« L41-071026-L2-VI01 ») et les DLC existent dans le fichier Linkee. | Un n° de lot facultatif à la déclaration, ou lu sur l'étiquette ; contrôle de cohérence avec la semaine de production. Utile seulement si les équipes ont le lot sous la main. | Les équipes ont-elles le n° de lot au moment de la perte ? |
| 8 | **Fonctionnement hors ligne** | PWA installable, en ligne seulement. | File d'attente sur la tablette, envoi au retour du réseau, contrôles refaits par le serveur. Développement lourd, utile seulement si le réseau manque en cuisine. | Le réseau est-il fiable dans les zones de saisie ? |
| 9 | **Autres coûts indirects** | Composante « indirect » prévue et vide (Phase 3, §18.4) ; main-d'œuvre non imputée (§18.2). | Une méthode d'imputation décidée par l'entreprise. | Méthode de l'entreprise (en attente depuis la Phase 3). |

## Proposition d'ordre

1. **Alertes** (pistes 3 et 4) et **tendances** (piste 6) : elles s'appuient sur les données déjà collectées et
   sur la tâche de nuit existante.
2. **Objectifs** (piste 5) : dès que vous avez des valeurs cibles.
3. **Imports automatiques** (piste 2), si les partages sont accordés ; **API Melba** (piste 1) si elle existe.
4. **Lots** (piste 7) et **hors ligne** (piste 8) seulement si l'essai pilote montre qu'ils sont utiles.
5. **Coûts indirects** (piste 9) quand la méthode sera décidée.

L'essai pilote avec les équipes peut se faire en parallèle : il ne dépend d'aucune de ces pistes.

## Décisions

| Date | Sujet | Décision |
|---|---|---|
| 16/11/2026 | Pistes retenues | **Alertes et tendances** d'abord (pistes 3, 4 et 6). |
| 16/11/2026 | Réseau en cuisine | **Coupures fréquentes** : la saisie hors ligne (piste 8) devient utile ; à proposer après les alertes. |
| 16/11/2026 | API Melba, partage des Google Sheets | **Renseignements en cours** de votre côté ; dépôts manuels en attendant. |
| 16/11/2026 | Perte inhabituelle | Alerte quand une équipe, une zone ou un plat dépasse de **50 %** la moyenne des **4 semaines précédentes**, à volume égal (kg pour 1 000 barquettes produites) quand la production est connue, sinon en kg. |
| 16/11/2026 | Seuil minimal | **5 kg** : pas d'alerte en dessous, même si la hausse dépasse 50 %. |
| 16/11/2026 | Cause récurrente | Alerte quand la **même cause est en tête** des pertes d'une équipe ou d'un plat **3 semaines de production de suite**. |
| 16/11/2026 | Destinataires | **Dans l'application** : encadré à l'accueil des responsables (toutes les alertes) et de l'équipe concernée (les siennes), avec le détail et un bouton « vu ». Seuils réglables dans l'administration. |

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 6.1 | **Tendances** : moyenne glissante sur 4 semaines et sens de la tendance (hausse, stable, baisse) pour les kg, le coût net et les kg pour 1 000 barquettes, dans « Évolution », la synthèse de la semaine et les rapports. | ✅ |
| 6.2 | **Pertes inhabituelles** : calcul à la fin de chaque semaine de production (tâche de nuit existante) par équipe, zone et plat ; seuils réglables (50 %, 5 kg). | ✅ (affichage à l'étape 6.4) |
| 6.3 | **Causes récurrentes** : même cause en tête 3 semaines de suite, par équipe et par plat. | ✅ (affichage à l'étape 6.4) |
| 6.4 | **Affichage des alertes** : encadré à l'accueil, détail, bouton « vu », historique ; réglages dans l'administration. | ✅ |

Points de méthode à valider avec l'étape concernée :
- **Tendance (6.1)** : « stable » quand la moyenne des 4 dernières semaines s'écarte de moins de 10 % de celle des
  4 semaines d'avant (seuil proposé, réglable).
- **Plats (6.2, 6.3)** : un plat ne revient pas chaque semaine ; sa référence est la moyenne des semaines où il a
  été produit parmi les 4 précédentes, et il en faut au moins 2. Sinon, pas d'alerte.
- **Semaine terminée** : une semaine est analysée la nuit qui suit son mercredi, pour ne pas alerter sur une
  semaine incomplète.

## Étape 6.1 — Tendances (faite le 16/11/2026)

Règle R19 de docs/REGLES_METIER.md.
- **Calcul** (`src/domain/tendances.ts`) : moyenne glissante d'une semaine = moyenne de cette semaine et des 3
  précédentes ; sens = moyenne des 4 dernières semaines (semaine choisie comprise) comparée à celle des 4 semaines
  d'avant ; « stable » sous 10 % d'écart. Il faut au moins 2 semaines connues dans chaque moyenne.
- **Semaines d'avant la première perte enregistrée** : non comptées. Sinon, au début de l'utilisation de l'outil,
  chaque indicateur paraîtrait « en hausse » par rapport à des semaines vides (même règle que l'évolution
  mensuelle).
- **Indicateurs** : kg de pertes alimentaires, kg pour 1 000 barquettes prévues, kg pour 1 000 barquettes
  produites, coût net (profils qui voient les euros).
- **Où** : onglet « Évolution » (tableau « Tendance sur 8 semaines », ligne de moyenne sur les histogrammes des kg
  et du coût net), synthèse de la semaine (tableau et ligne de moyenne), rapport PDF hebdomadaire, export de
  l'onglet « Évolution » (tendance et moyenne glissante semaine par semaine).
- Le seuil de 10 % est réglable dans Administration → Seuils des alertes (étape 6.4).

## Étape 6.2 — Pertes inhabituelles (faite le 16/11/2026)

Règle R20 de docs/REGLES_METIER.md.
- **Calcul** (`src/domain/pertes-inhabituelles.ts`) : pertes de la semaine comparées à la moyenne des 4 semaines
  précédentes où l'unité était concernée (au moins 2) ; à volume égal (kg pour 1 000 barquettes produites) quand
  la production de la semaine et d'au moins 2 semaines de référence est connue, sinon en kg ; alerte à partir de
  +50 %, jamais sous 5 kg. Une moyenne nulle avec au moins 5 kg est signalée sans pourcentage.
- **Unités** : équipe (production de ses plats d'après le plan), zone (production de toute l'entreprise : une zone
  ne produit pas de barquettes), plat (pertes déclarées sur le plat lui-même ; semaines de référence : celles où il
  est au plan ou au décompte).
- **Semaines de référence** : seulement après la mise en service (`ALERTES_DEBUT`), et pas celles où l'équipe est
  déclarée inactive.
- **Tâche de nuit** (`npm run alertes:evaluer`, workflow « Alertes quotidiennes ») : chaque semaine terminée des
  21 derniers jours est recalculée. Une correction peut faire disparaître une alerte tant qu'elle n'a pas été vue.
- **Contexte enregistré** avec chaque alerte : les 3 causes et les 3 produits qui pèsent le plus dans la semaine.
- **Tables** (migration 0022) : `loss_alerts` (alertes d'analyse, aussi pour l'étape 6.3) et `alert_settings`
  (seuils : +50 %, 5 kg, 3 semaines, 10 % pour la tendance ; écran de réglage à l'étape 6.4).
- Essai sur la base locale : 4 alertes calculées correctement (S45 et S46), puis effacées avec les alertes « rien
  de noté » créées par cet essai.

## Étape 6.3 — Causes récurrentes (faite le 16/11/2026)

Règle R21 de docs/REGLES_METIER.md.
- **Calcul** (`src/domain/causes-recurrentes.ts`) : cause en tête d'une semaine = celle qui pèse le plus en kg de
  pertes alimentaires, puis celle qui a le plus de pertes déclarées ; une égalité parfaite ne donne pas de cause
  en tête. Alerte quand la même cause est en tête 3 semaines de suite (réglage `recurrence_weeks`).
- **Équipe** : ses dernières semaines de production consécutives ; une semaine sans perte interrompt la série.
- **Plat** : ses dernières semaines de production (au plan ou au décompte), consécutives ou non, puisqu'un plat ne
  revient pas chaque semaine ; recherche sur les 9 dernières semaines.
- Semaines prises en compte : seulement après la mise en service (`ALERTES_DEBUT`).
- **Contexte enregistré** : la cause et, pour chaque semaine de la série, ses kg, son nombre de pertes et sa part
  des kg de l'unité.
- Même tâche de nuit et même table `loss_alerts` que l'étape 6.2 (type « cause_recurrente »).

## Étape 6.4 — Affichage des alertes et réglages (faite le 17/11/2026)

- **Accueil** : encadré « N alertes d'analyse à voir », les 3 plus récentes avec leur détail et un bouton « Vu »,
  lien vers la liste complète.
- **Page Alertes d'analyse** (`/alertes/analyse`) : « À voir » ou « Toutes », « Tout marquer comme vu », rappel des
  seuils en vigueur. Chaque alerte donne :
  - perte inhabituelle : valeur de la semaine, moyenne de référence, dépassement, causes et produits principaux ;
  - cause récurrente : la cause, les semaines de la série, ses kg et sa part des pertes chaque semaine.
- **Qui voit quoi** :
  - toutes les alertes : production, administration, direction (profils qui voient toutes les alertes ou
    comparent les équipes) ;
  - responsable de zone : les alertes de ses zones ;
  - équipe : son alerte d'équipe et celles de ses plats (équipe du plat d'après le plan).
- **« Vu » par compte** (table `loss_alert_views`, migration 0023) : chacun retire l'alerte de son accueil. La
  première lecture fige l'alerte : une correction ne la fait plus disparaître de l'historique.
- **Administration → Seuils des alertes** : dépassement (50 %), minimum (5 kg), semaines de suite (3), tendance
  stable (10 %). Chaque modification est inscrite au journal d'audit. Le seuil de tendance s'applique tout de
  suite aux statistiques et aux rapports ; les autres à la prochaine analyse de nuit.
- Vérifié dans le navigateur avec 4 alertes calculées sur la base locale (puis effacées) : encadré, « Vu »,
  liste complète, enregistrement des seuils.

**Alertes et tendances terminées.** Les alertes partiront dès que la date de mise en service (`ALERTES_DEBUT`) sera
fixée ; les premières pertes inhabituelles demandent 2 semaines de référence, les causes récurrentes 3 semaines.

