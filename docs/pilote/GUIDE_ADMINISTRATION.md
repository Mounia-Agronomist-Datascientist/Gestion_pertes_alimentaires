# Guide de l'administration — la semaine type

Application **Pertes** · semaine de production du **jeudi au mercredi**.

## La page Administration

La page **Administration** est rangée en 6 familles (pastilles en haut pour y aller directement) :
1. **Chaque semaine** — Import de la semaine · Recoupement de la semaine · Matières à compléter.
2. **Ce que les équipes voient à la saisie** — Causes · Destinations · Zones et postes · Gastros et tares.
3. **Produits et achats** — Produits · Fournisseurs · Lieux de stockage des matières.
4. **Équipes, comptes et calendrier** — Comptes · Équipes par semaine · Jours de production.
5. **Coûts et environnement** — Emballages et consommables · Main-d'œuvre · Facteurs d'émission (CO2e) ·
   Rattachement des ingrédients.
6. **Alertes et contrôle** — Seuils des alertes · Journal d'audit.

## Chaque semaine

Semaine de production du jeudi au mercredi : **S** = semaine en cours, **S-1** = celle qui vient de se terminer, **S+1** = celle qui commence jeudi. La page Import de la semaine est rangée dans le même ordre (mardi, puis jeudi), avec pour chaque document ce qu'il est, sa semaine et à quoi il sert.

| Quand | Où | Quoi |
|---|---|---|
| **Mardi** (avant la nouvelle semaine) | Administration → **Import de la semaine** | Pour la semaine qui commence jeudi (**S+1**) : déposer le **tome Melba** (PDF « Imprimer les recettes ») et le **plan de production** (Google Sheets → Fichier → Télécharger → Microsoft Excel). Vérifier l'aperçu (plats par équipe, anomalies) puis valider. Sans import, les équipes ne voient pas les plats de la semaine. |
| Mardi | Administration → **Import de la semaine** → **Tome des encas** | Déposer le **PDF Melba des encas** (« Imprimer les recettes », recettes EN…), téléchargé à part du tome : poids et prix de chaque encas mis à jour (nouvelle version datée si le prix ou le poids change), nouveaux encas ajoutés à la liste. **Premier chargement** : le PDF de tous les encas récemment utilisés, sur plusieurs semaines. Donner ensuite leur famille aux nouveaux encas (Administration → Produits). |
| Mardi | Administration → **Équipes par semaine** | Désactiver une équipe qui ne travaille pas (semaine creuse) : pas d'alerte « saisie incomplète » pour elle. |
| Avant un férié ou un samedi travaillé | Administration → **Jours de production** | Retirer le jour férié, ajouter le samedi. |
| **Après la fin de la semaine** (jeudi) | Administration → **Import** → « Barquettes réellement produites » | Déposer le **« Décompte barquettes »** (**S-1**) : il donne les ratios et la comparaison à volume égal. |
| **Jeudi** | Administration → **Import** → « Pesées des Alchimistes » | Déposer leur export (CSV ou Excel) jusqu'à la semaine terminée (**S-1**) : comparaison avec nos kg déclarés au compost. |
| **Jeudi** | Administration → **Import** → « Ventes et dons des surplus » | Déposer **VENTES TGTG**, **VENTES FLASH**, **Linkee** (Excel) jusqu'à la semaine terminée (**S-1**). Un fichier redéposé remplace sa période. |
| **Jeudi** | Administration → **Import** → « Bons de commande fournisseurs » | Déposer les **bons de commande** de la semaine suivante (**S+1**) (PDF, ou le dossier du Drive en ZIP). Nouvelles matières, colis et prix d'achat sont enregistrés ; un bon redéposé est remplacé. |
| Jeudi, après les bons | Administration → **Recoupement de la semaine** | Ingrédients du tome face aux bons de la semaine : écarts de prix, commandes absentes du tome, ingrédients sans commande. |
| Jeudi, après les bons | Administration → **Matières à compléter** | Matières de la semaine et de la suivante sans fournisseur ou sans poids de colis : les compléter sur la fiche produit (colis saisi à la main), une fois pour toutes. |
| Jeudi | Accueil, **Alertes d'analyse** | Pertes inhabituelles et causes récurrentes de la semaine terminée (calculées dans la nuit). Les lire, noter « Vu ». |
| Chaque jour ou deux | **Alertes « saisie incomplète »** | Équipes sans déclaration un jour de production (150 kg estimés). Lever une alerte justifiée, avec motif (équipe en formation…). |
| Au fil de l'eau | Administration → **Causes** | Valider ou refuser les causes proposées par les équipes. |
| Une fois, puis à chaque nouvelle cause | Administration → **Causes** | Vérifier la **famille** et le caractère **évitable** de chaque cause (classement proposé, à valider) : ils alimentent « Pertes évitables » et « Par famille de cause racine ». |
| Au fil de l'eau | Administration → **Produits** | **Articles saisis à la main** (Réception, Stockage) : valider, corriger la fiche ou fusionner avec l'article existant ; valider un nouveau fournisseur. Saisies « hors liste » : indiquer le prix d'achat (la perte est chiffrée), rattacher à un produit de la liste ou créer le produit avec son prix. Encas : type « Encas » et sa famille sur la fiche produit (une ligne de bon « ENCAS » en crée un tout seul). |
| Lundi ou mardi | Statistiques → **Synthèse de la semaine** · **Rapports PDF** | Rapport hebdomadaire pour la réunion de production. |

## Ponctuellement

- **Comptes** (Administration → Comptes) : un compte par équipe et par fonction, **sans prénom**. Réinitialiser le
  mot de passe d'une équipe à chaque départ : toutes ses sessions sont fermées et le nouveau mot de passe doit être
  changé à la première connexion. Attention : les pertes encore en attente sur une tablette partiront après la
  reconnexion de l'équipe. **Zones** : sous chaque compte, cocher les zones où il saisit ses pertes et dont il voit
  les résultats (les autres zones restent visibles, grisées). Par défaut : une équipe en Cuisine/production, un
  responsable de zone ses zones, les autres profils toutes les zones.
- **Seuils des alertes** (Administration → Seuils des alertes) : dépassement (50 %), minimum (5 kg), semaines de
  suite (3), tendance stable (10 %).
- **Facteurs CO2e** (Administration → Facteurs d'émission) : valider les familles, rattacher les nouveaux
  ingrédients Melba (filtre « À rattacher » après chaque nouveau tome).
- **Lieux de stockage des matières** (Administration → Lieux de stockage des matières) : ranger chaque catégorie
  Melba dans un lieu de Stockage, une fois, puis pour chaque nouvelle catégorie apportée par les bons. En Stockage,
  la saisie propose d'abord les matières de la semaine rangées dans le lieu choisi. Une matière rangée ailleurs que
  sa catégorie : lieu propre sur sa fiche (Administration → Produits → Fiche).
- **Prix d'une matière** (Administration → Produits → Fiche) : voir toutes les versions (tome, bon, saisi à la
  main) ; saisir un prix daté quand le bon ou le tome est faux. Les pertes déjà enregistrées gardent leur coût.
- **Fournisseurs** (Administration → Fournisseurs) : renommer, voir les matières de chacun. Un colis qu'aucun bon ne
  donne : « Saisir un colis » sur la fiche du produit (pour l'information).
- **Emballages et main-d'œuvre** : mettre à jour les coûts datés quand ils changent.
- **Journal d'audit** : qui a fait quoi, avant/après.

## Si…

| Situation | Que faire |
|---|---|
| Une équipe ne trouve pas un plat | L'import de la semaine est-il fait ? Le plat est-il dans le plan de son équipe ? |
| Une équipe a dépassé le délai | Un responsable déclare ou corrige à sa place (déclaration : 7 jours ; correction : une semaine après la fin de la semaine de production). |
| Litige fournisseur (lot, DLC) | Historique → la perte : **lots, DLC et quantités** notés en Réception ou Stockage, et les **photos de l'étiquette** (touchez une photo pour l'agrandir). Les photos sont **effacées au bout de 3 mois** : enregistrer celles utiles au litige avant ; le lot, la DLC et la quantité restent. |
| Une perte est restée « en attente » sur une tablette | Ouvrir l'application sur cette tablette avec le compte de l'équipe, réseau disponible : l'envoi part tout seul. Page « Pertes en attente » pour voir les refus et leur motif. |
| Tablette changée ou remise à zéro | Les pertes en attente sur l'ancienne tablette sont perdues : les faire saisir à nouveau. |
| Le site ne répond plus | Vérifier l'hébergement (Netlify, Neon). Les équipes peuvent continuer à saisir hors ligne quelques minutes. |
