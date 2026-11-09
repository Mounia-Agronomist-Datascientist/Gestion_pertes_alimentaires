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

## Ce que je prépare dans le projet

- Configuration de déploiement et en-têtes de sécurité (HTTPS strict, protection contre l'intégration de la page).
- Commande de mise en production : migrations de base puis données initiales, **sans** les comptes de test.
- Création du compte administrateur de production : mot de passe provisoire affiché une seule fois.
- **Sauvegarde quotidienne** automatique de la base (GitHub Actions, gratuit pour un dépôt privé), conservée
  30 jours, et procédure de restauration testée.
- **Tâche quotidienne** des alertes « saisie incomplète » (22h), qui ne fera rien tant que la date de mise en
  service des alertes n'est pas fixée.

## Ce que vous devez faire (création de comptes : je ne peux pas le faire à votre place)

1. Pousser le projet sur GitHub (GitHub Desktop → Push origin) : Netlify déploie depuis GitHub.
2. Créer un compte **Neon** (ou utiliser celui du développeur), un projet en région Europe, et me donner…
   rien en clair dans la conversation : l'adresse de connexion se colle directement dans les réglages Netlify.
3. Créer ou utiliser l'équipe **Netlify** de l'entreprise et y relier le dépôt GitHub.
