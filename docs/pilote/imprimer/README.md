# Documents du pilote à imprimer

PDF A4 prêts à imprimer, produits depuis les fichiers HTML de ce dossier (feuille de style `style.css`) :

| PDF | Pour qui | Pages |
|---|---|---|
| `fiche-equipes.pdf` | Équipes (près de chaque tablette) | 2 (recto-verso) |
| `guide-administration.pdf` | Administration | 3 |
| `bilan-application.pdf` | Administration : état de l'application, toutes ses fonctions et options, ce qui reste à faire (depuis docs/pilote/BILAN_APPLICATION.md) | 5 |
| `plan-pilote.pdf` | Administration ; pages 3 et 4 à remettre aux équipes pilotes (chronométrage, retours) | 4 |

Le contenu suit docs/pilote/*.md : après une modification, mettre à jour le HTML puis réimprimer en PDF avec Chrome
(sans en-têtes ni pieds de page), par exemple :

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer --print-to-pdf=fiche-equipes.pdf fiche-equipes.html
```
