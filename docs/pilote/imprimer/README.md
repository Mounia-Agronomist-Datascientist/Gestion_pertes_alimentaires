# Documents du pilote à imprimer

PDF A4 prêts à imprimer, produits depuis les fichiers HTML de ce dossier (feuille de style `style.css` ; fiches explicatives : `fiches.css`, aux couleurs de la charte) :

| PDF | Pour qui | Pages |
|---|---|---|
| `fiche-equipes.pdf` | Équipes (près de chaque tablette) | 2 (recto-verso) |
| `guide-administration.pdf` | Administration | 3 |
| `bilan-application.pdf` | Administration : état de l'application, toutes ses fonctions et options, ce qui reste à faire (depuis docs/pilote/BILAN_APPLICATION.md) | 6 |
| `fiche-principe.pdf` | Tout le monde : à quoi sert l'application, le chemin d'une perte, ce qu'elle calcule et comment, statistiques, alertes, qui fait quoi | 3 |
| `fiche-reception.pdf` | Zone 1, Réception : le poste, les étapes de saisie, les causes, les calculs (colis, prix, retour fournisseur, fournisseur, plusieurs jours), bonnes pratiques | 3 |
| `fiche-stockage.pdf` | Zone 2, Stockage : les 6 postes et les produits proposés, les étapes, les causes, les calculs, bonnes pratiques | 3 |
| `fiche-cuisine.pdf` | Zone 3, Cuisine / Production : les 4 postes, les étapes (pièces, gastros, emballages en salle blanche), les causes, les calculs (tare, portions, coûts du tome), « rien de noté », délais | 3 |
| `plan-pilote.pdf` | Administration ; pages 3 et 4 à remettre aux équipes pilotes (chronométrage, retours) | 4 |

Le contenu suit docs/pilote/*.md : après une modification, mettre à jour le HTML puis réimprimer en PDF avec Chrome
(sans en-têtes ni pieds de page), par exemple :

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer --print-to-pdf=fiche-equipes.pdf fiche-equipes.html
```
