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
| 17/11/2026 | API Melba | **Pas d'API** pour l'instant : le tome est déposé chaque semaine (piste 1 abandonnée). |
| 16/11/2026 | Perte inhabituelle | Alerte quand une équipe, une zone ou un plat dépasse de **50 %** la moyenne des **4 semaines précédentes**, à volume égal (kg pour 1 000 barquettes produites) quand la production est connue, sinon en kg. |
| 16/11/2026 | Seuil minimal | **5 kg** : pas d'alerte en dessous, même si la hausse dépasse 50 %. |
| 16/11/2026 | Cause récurrente | Alerte quand la **même cause est en tête** des pertes d'une équipe ou d'un plat **3 semaines de production de suite**. |
| 17/11/2026 | Saisie hors ligne : appareils | **Tablettes Android, téléphones, ordinateurs** (Chrome, Edge, Firefox ; pas d'iPad). |
| 17/11/2026 | Saisie hors ligne : coupures | **Quelques minutes** (zones blanches, wifi instable). |
| 17/11/2026 | Saisie hors ligne : délai de 7 jours | **Compté à partir de l'heure de saisie** sur l'appareil ; l'heure de réception est aussi gardée. |
| 17/11/2026 | Saisie hors ligne : périmètre | **Déclarer** (une perte, plusieurs pertes). Historique, corrections, statistiques et administration restent en ligne. |
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


## Saisie hors ligne — analyse (17/11/2026)

Décision du 16/11/2026 : le réseau coupe souvent en cuisine, la saisie hors ligne (piste 8) devient utile.

**Aujourd'hui** : l'application est installable (manifeste), mais sans service worker. Une perte se valide par un
appel au serveur. Si le réseau coupe à ce moment, la saisie échoue : l'équipe doit attendre et recommencer. Une
page ouverte ou rechargée sans réseau ne s'affiche pas.

**Ce que Next.js 16 apporte** : l'option expérimentale `useOffline` retient un envoi pendant une coupure et le relance
au retour du réseau, avec un indicateur « hors ligne ». Mais seulement si la page reste ouverte : un envoi en attente
est perdu si la tablette se met en veille ou si l'onglet se ferme. Il faut donc aussi une file d'attente sur la
tablette.

**Ce qu'il faudrait** :
1. **File d'attente sur la tablette** (IndexedDB) : une perte validée sans réseau est gardée sur l'appareil, avec
   l'heure de la saisie, puis envoyée au retour du réseau. Elle survit à la veille et à la fermeture de l'application.
2. **Pas de doublon** : chaque perte reçoit un identifiant créé sur la tablette ; le serveur ignore un second envoi
   du même identifiant (une colonne de plus, migration).
3. **Application disponible sans réseau** : un service worker garde les pages de saisie et leurs fichiers ; les
   listes de la semaine (postes, causes, destinations, plats, tares) sont gardées sur la tablette à chaque
   ouverture en ligne.
4. **Contrôles à la réception** : le serveur refait tous les contrôles. Une perte refusée (produit retiré, délai
   dépassé…) reste sur la tablette dans une liste « à corriger », avec le motif.
5. **Affichage** : bandeau « Hors ligne : vos pertes sont gardées sur cet appareil », compteur des pertes en
   attente, envoi automatique au retour du réseau.

**Limites** : historique, corrections, statistiques et administration restent en ligne seulement. Une perte en
attente n'est visible que sur la tablette qui l'a saisie, et ne compte dans les statistiques et les alertes qu'une
fois reçue. Si la session a expiré pendant la coupure, il faut se reconnecter avant l'envoi : rien n'est perdu.

**Décisions prises le 17/11/2026** (tableau des décisions) : Android, téléphones et ordinateurs ; coupures de
quelques minutes ; délai compté depuis l'heure de saisie ; déclarer seulement.

**Étapes proposées** :

| Étape | Contenu | État |
|---|---|---|
| 6.5 | **Envoi qui résiste aux coupures** : identifiant unique créé sur l'appareil (pas de doublon), heure de saisie gardée et utilisée pour le délai, file d'attente sur l'appareil (IndexedDB), bandeau « hors ligne » et compteur des pertes en attente, envoi automatique au retour du réseau, liste « à corriger » pour une perte refusée. Pour une perte ou une série. | ✅ |
| 6.6 | **Ouverture sans réseau** : service worker qui garde les pages de saisie et leurs fichiers ; listes de la semaine (postes, causes, destinations, plats, tares) gardées sur l'appareil à chaque ouverture en ligne. | ✅ |

Point de méthode appliqué à l'étape 6.5 : l'heure de saisie vient de l'horloge de l'appareil. Le serveur la
refuse si elle a plus de 5 minutes d'avance ; sinon il la garde telle quelle pour le délai.

## Étape 6.5 — Envoi qui résiste aux coupures (faite le 17/11/2026)

Règle R22 de docs/REGLES_METIER.md.
- **Serveur** (migration 0024) : chaque perte peut porter un identifiant créé sur l'appareil (`client_id`, unique)
  et son heure de saisie. Un second envoi du même identifiant rend la perte déjà enregistrée, sans doublon (aussi
  pour une série). L'heure de saisie devient l'heure de déclaration ; l'heure de réception est gardée
  (`received_at`) quand la perte arrive plus d'une minute après.
- **Délai de 7 jours** compté depuis l'heure de saisie. Refus : heure de saisie en avance de plus de 5 minutes ;
  pour une équipe, saisie de plus de 7 jours (à faire enregistrer par un responsable).
- **Appareil** (`src/modules/declarations/offline-queue.ts`) : sans réseau, ou si l'envoi échoue faute de réseau,
  la perte (ou la série) est gardée dans IndexedDB, par compte. Envoi automatique : au démarrage, au retour du
  réseau, au retour sur l'application et toutes les 20 secondes tant qu'il reste des pertes. Un refus du serveur
  la passe « refusée » avec le motif ; une session expirée demande de se reconnecter sans rien perdre.
- **Écrans** : bandeau « Hors ligne » et nombre d'envois en attente sur toutes les pages ; écran « Perte gardée
  sur cet appareil » après validation ; page « Pertes en attente sur cet appareil » (`/declarer/en-attente`) avec
  « Renvoyer » et « Supprimer » pour une perte refusée. Les corrections restent en ligne seulement.
- **Vérifié dans le navigateur** : perte validée serveur arrêté (gardée sur l'appareil, bandeau), page rechargée,
  serveur relancé : envoyée toute seule et reçue une seule fois. La perte d'essai a ensuite été effacée de la base
  locale.

## Étape 6.6 — Ouverture sans réseau (faite le 17/11/2026)

Règle R22 (complétée) de docs/REGLES_METIER.md.
- **Service worker** (`public/sw.js`, enregistré en production seulement) :
  - pages de saisie (accueil, une perte, plusieurs pertes, pertes en attente) : réseau d'abord ; la dernière
    version reçue est gardée sur l'appareil et servie sans réseau, avec les listes de la semaine qu'elle contient ;
  - fichiers de l'application (`/_next/static`) gardés à la première lecture (300 au plus) ;
  - toute autre page sans réseau : page « Hors ligne » avec les liens vers la saisie ;
  - rien d'autre n'est gardé (ni envois, ni statistiques, ni administration).
- **Changement de compte** : la page de connexion (après une déconnexion) efface les pages gardées ; un appareil
  partagé ne montre jamais les listes d'un autre compte. Les pertes en attente restent et partent à la prochaine
  connexion de leur compte.
- **Listes d'un jour précédent** : la saisie prend la date de l'appareil et prévient que les plats proposés peuvent
  dater d'une autre semaine ; la perte est revérifiée à l'envoi (refusée avec son motif si besoin).
- `/sw.js` est exclu du contrôle de session (il était redirigé vers la connexion) et toujours relu
  (`Cache-Control: no-cache`) pour qu'une nouvelle version s'installe.
- **Vérifié** dans un Chrome sans interface (profil temporaire) sur le build de production local : service worker
  actif, pages gardées ; serveur arrêté : « Déclarer une perte » et « Plusieurs pertes » s'ouvrent et la saisie
  avance (zone, produit) ; « Statistiques » affiche la page « Hors ligne » ; déconnexion : pages gardées effacées.
  Le navigateur intégré de l'application Claude n'accepte pas les service workers : l'essai n'y est pas possible.
- **Reste à faire pendant le pilote** : essai sur une vraie tablette Android en coupant le wifi, avec l'application
  installée sur l'écran d'accueil.

**Saisie hors ligne terminée** (étapes 6.5 et 6.6).


## Référentiel des matières premières tiré des tomes — analyse (17/11/2026)

**Constat** : en Réception et en Stockage, la saisie ne propose que les encas de la semaine (règle R9) et les
produits saisis à la main (Administration → Produits, presque vide). Les ingrédients des tomes ne sont proposés
qu'en cuisine, sous chaque plat.

**Ce que donnent les tomes** : pour chaque ingrédient, son libellé, son unité d'utilisation (g, ou « pot (125 g) »,
« portion (25 g) », « sachet (40 g) »… avec le poids d'une pièce) et son coût, donc un prix au kg ou à la pièce.
Les 3 tomes déjà importés (S45 à S47) comptent 268 ingrédients différents. Ils ne donnent **pas** le colis
fournisseur (carton de 6, sac de 10 kg).

**Décisions du 17/11/2026** :

| Sujet | Décision |
|---|---|
| Zones | La liste des ingrédients de la semaine est proposée en **Réception** et en **Stockage** (avec les encas). |
| Conditionnement | L'unité et le prix du tome, **et aussi le colis fournisseur** : saisi dans l'administration (ou importé si un fichier fournisseur existe). |
| Modifications manuelles | **Gardées** : un nouveau tome ajoute les nouveaux produits et met à jour le prix et l'unité par une nouvelle version datée, sans toucher au nom ni aux réglages faits à la main. |
| Menu de la saisie | **Les produits de la semaine d'abord** (ingrédients et encas du tome de la semaine), tous les autres produits connus restant trouvables par la recherche. |

**Étapes proposées** : remplacées par celles de la section suivante (bons de commande).

## Bons de commande fournisseurs — analyse (17/11/2026)

**Source** : dossier Drive « bons de commande », un sous-dossier par fournisseur (54 fournisseurs, plusieurs
centaines de PDF, le plus ancien en S11). Lu en lecture seule ; le sous-dossier « Fiches de répartition par équipe
(pas des BC) » est ignoré. Les BC de la semaine S+1 sont disponibles au plus tôt le jeudi de la semaine S.

**Ce que donne un BC** (PDF généré par Melba, même mise en page pour tous les fournisseurs) :

- nom du fichier : `AAAAMMJJ_Fournisseur_Snn_BC numéro.pdf` (date de livraison, fournisseur, semaine) ;
- en-tête : numéro du BC, fournisseur, objet (« S47 Camion A », « S46 100% », « ENCAS S48 »), date de livraison ;
- une ligne par matière : **désignation** (le même libellé que l'ingrédient du tome, sans la pastille 🟢),
  **code fournisseur** (parfois absent), **catégorie Melba** (Viande, Épicerie, Légume 4e gamme, Fromages frais
  & AOP…), **quantité**, **conditionnement** (« Sachet 5kg (5.00 kg) », « Carton (5.00 kg) », « Barquette (20.00
  Merguez) », « Bouteille 64cl (64.00 cL) »), **prix unitaire HT** (au kg ou au colis) et total HT.
- **Pas de zone de stockage.**
- Les adresses e-mail (interlocuteurs du fournisseur, personne de la Brigade) ne sont **jamais lues ni
  stockées** : seul le nom du fournisseur est gardé.

**Décisions du 17/11/2026** :

| Sujet | Décision |
|---|---|
| Entrée des BC | **Dépôt des PDF** dans Administration → Import (sélection de tous les BC de la semaine d'un coup). Aucun accès de l'application au Drive. |
| Zone de stockage | **Par catégorie** : réglage « catégorie Melba → sous-zone de Stockage » fait une fois, modifiable produit par produit. |
| Prix d'une perte de matière première | **Dernier prix d'achat du BC**, à défaut le coût du tome. Chaque changement crée une version datée ; les pertes passées gardent leur coût figé. |
| Historique | **Tous les BC** déjà dans le Drive sont repris au départ. |

**Étapes proposées** :

| Étape | Contenu | État |
|---|---|---|
| 6.7 | **Référentiel des matières premières** : fournisseurs, catégories Melba, matières (une par ingrédient Melba, rapprochées par le libellé), conditionnements par fournisseur (libellé, contenance, unité), prix datés (source BC ou tome), zone de stockage par catégorie (modifiable par matière). Construit à partir des tomes déjà importés. | Proposée |
| 6.8 | **Import des bons de commande** : dépôt de plusieurs PDF, lecture, aperçu (matières nouvelles, prix changés, lignes illisibles), validation ; un BC redéposé remplace l'ancien (même numéro). Reprise de l'historique du Drive. | Proposée |
| 6.9 | **Recoupement de la semaine** : pour une semaine de production, ingrédients du tome face aux matières commandées — ingrédients sans commande, commandes absentes du tome, écarts de prix tome/BC. | Proposée |
| 6.10 | **Saisie en Réception et en Stockage** : d'abord les matières de la semaine (commandées et du tome) et les encas, filtrées par sous-zone de stockage ; tout le référentiel par la recherche ; coût d'après la version en vigueur à la date de la perte. | Proposée |
| 6.11 | **Administration → Produits** : fournisseurs, matières, conditionnements, prix et leurs versions ; réglage catégorie → zone ; ajout, modification datée, désactivation ; modifications manuelles gardées aux imports suivants. | Proposée |
