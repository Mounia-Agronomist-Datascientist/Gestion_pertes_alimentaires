# Hébergement (proposition du 09/11/2026)

Décision de l'entreprise : un hébergeur **géré, sécurisé et gratuit** pour démarrer, puis migration vers la
plateforme utilisée par le développeur de l'entreprise pour centraliser les outils.

## Recommandation : Netlify (application) + Neon (base PostgreSQL)

| Besoin | Netlify (offre gratuite) | Neon (offre gratuite) |
|---|---|---|
| Usage commercial autorisé | Oui (contrairement à Vercel « Hobby », réservé à l'usage personnel non commercial) | Oui |
| Déjà utilisé dans l'entreprise | Oui : l'outil « Pertes Production » y est hébergé | — |
| HTTPS, mises à jour, sécurité | Inclus | Connexions chiffrées (SSL) |
| Déploiement | Automatique à chaque envoi sur GitHub | — |
| Capacité | Quota mensuel de crédits ; le site est mis en pause (pas de facturation) si le quota est dépassé | 0,5 à 1 Go : plusieurs années de déclarations |
| Sauvegardes | — | Très limitées dans l'offre gratuite → **sauvegarde quotidienne gérée par nous** (voir ci-dessous) |

**Points d'attention à vérifier à l'ouverture des comptes** (les offres gratuites évoluent souvent) :
1. **Région** : base en Europe (Francfort) de préférence. Si les fonctions Netlify gratuites tournent hors
   d'Europe, chaque page fait plusieurs allers-retours transatlantiques (pages un peu plus lentes). À mesurer
   pendant l'essai pilote.
2. **Next.js 16** : la prise en charge par Netlify passe par un adaptateur ; à valider au premier déploiement.
3. **Quota mensuel** : à surveiller les premières semaines (8 équipes + responsables, usage modéré).

Alternative si un point bloque : Render ou Koyeb (application) avec la même base Neon. Le code ne dépend
d'aucun service propre à Netlify, ce qui facilitera la migration vers la plateforme du développeur.

## Ce qui est prêt dans le projet

| Élément | Fichier | Vérifié |
|---|---|---|
| Configuration Netlify | `netlify.toml` | — (au premier déploiement) |
| En-têtes de sécurité (HTTPS strict, page non intégrable, etc.) | `next.config.ts` | Build de production local |
| Connexion Neon (adresse poolée, peu de connexions par instance) | `src/db/client.ts` | — |
| Initialisation / mise à jour de la base : migrations, référentiels, compte `admin` (mot de passe provisoire), **jamais de comptes de test** | `npm run db:setup` | Base vide locale : refus sans mot de passe, création unique |
| Sauvegarde chiffrée (AES-256) et restauration | `scripts/backup.sh`, `scripts/restore.sh` | Sauvegarde → restauration → contenu identique ; mauvaise phrase secrète refusée sans toucher la base |
| Tests à chaque envoi sur GitHub | `.github/workflows/tests.yml` | — |
| Sauvegarde quotidienne (2h UTC), conservée 30 jours | `.github/workflows/sauvegarde.yml` | — |
| Alertes quotidiennes (21h30 UTC) | `.github/workflows/alertes.yml` | — |
| Initialiser / mettre à jour la base (à la main, sauvegarde préalable) | `.github/workflows/base-de-donnees.yml` | — |

## Pas-à-pas de mise en ligne (à faire par l'administratrice)

> Les adresses de connexion, phrases secrètes et mots de passe se saisissent **uniquement** dans les réglages
> de GitHub, Neon et Netlify. Ne jamais les coller dans une conversation, un e-mail ou un fichier du projet.

**1. GitHub** — Pousser le projet (GitHub Desktop → *Push origin*).

**2. Neon** — Créer un compte (ou utiliser celui du développeur de l'entreprise), puis un projet :
- nom : `pertes` ; région : **AWS Europe Central (Frankfurt)** ;
- dans *Connect*, relever deux adresses : l'adresse **poolée** (`…-pooler…`) et l'adresse **directe**
  (option *Connection pooling* désactivée).

**3. GitHub → dépôt → Settings → Secrets and variables → Actions**
- onglet *Secrets* → *New repository secret* :
  - `DATABASE_URL_DIRECT` : l'adresse **directe** de Neon ;
  - `BACKUP_PASSPHRASE` : une longue phrase secrète, **à conserver dans un gestionnaire de mots de passe**
    (sans elle, les sauvegardes sont illisibles) ;
  - `ADMIN_INITIAL_PASSWORD` : mot de passe provisoire du compte `admin` (10 caractères minimum) ;
- onglet *Variables* → `ALERTES_DEBUT` : laisser **vide** jusqu'à la fin des essais.

**4. GitHub → onglet Actions** → *Base de données (initialiser / mettre à jour)* → *Run workflow*.
Attendre la coche verte (2 à 3 minutes).

**5. Netlify** → *Add new site* → *Import an existing project* → GitHub → dépôt `Gestion_pertes_alimentaires`.
- Les réglages de construction sont lus dans `netlify.toml`.
- *Environment variables*, portée **Production uniquement** :
  - `DATABASE_URL` : l'adresse **poolée** de Neon ;
  - `DB_POOL_MAX` : `3`.
- Désactiver les *Deploy previews* (sinon des versions de test utiliseraient la base de production).
- *Deploy*.

**6. Première connexion** — Ouvrir l'adresse Netlify, se connecter avec `admin` et le mot de passe provisoire,
le changer, puis créer les comptes des équipes et des responsables dans *Administration → Comptes*.
Supprimer ensuite le secret `ADMIN_INITIAL_PASSWORD` sur GitHub.

**7. Vérifier la sauvegarde** — GitHub → Actions → *Sauvegarde quotidienne* → *Run workflow* : le fichier
chiffré apparaît dans *Artifacts*.

**8. Mises à jour suivantes** — Chaque envoi sur GitHub redéploie l'application. Quand une mise à jour contient
une migration de base, lancer d'abord l'action *Base de données (initialiser / mettre à jour)*.

## Restaurer une sauvegarde (en cas de problème)

1. GitHub → Actions → exécution de *Sauvegarde quotidienne* choisie → *Artifacts* → télécharger et dézipper.
2. Sur un poste avec PostgreSQL : `TARGET_URL=<adresse directe> BACKUP_PASSPHRASE=<phrase> RESTORE_CONFIRM=oui
   scripts/restore.sh pertes-AAAAMMJJ-HHMM.dump.enc`.
3. La restauration remplace tout le contenu de la base cible : à faire de préférence d'abord dans une base de test.
