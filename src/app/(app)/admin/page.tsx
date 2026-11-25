import Link from "next/link";

export const metadata = { title: "Administration — Pertes" };

interface Entry {
  href: string;
  title: string;
  text: string;
}

/**
 * Options de l'administration rangées par famille (décision du 23/11/2026), de l'usage le plus courant au plus rare :
 * d'abord le travail de la semaine, puis les listes, les produits, l'organisation, les coûts, le suivi.
 */
const FAMILIES: { id: string; title: string; text: string; entries: Entry[] }[] = [
  {
    id: "semaine",
    title: "1. Chaque semaine",
    text: "Fichiers à déposer et contrôles qui suivent",
    entries: [
      {
        href: "/admin/import",
        title: "Import de la semaine",
        text: "Tome Melba + plan et tome des encas (mardi), Décompte barquettes et bons de commande (jeudi), ventes et dons, pesées des Alchimistes",
      },
      {
        href: "/admin/recoupement",
        title: "Recoupement de la semaine",
        text: "Ingrédients du tome face aux bons de commande, écarts de prix",
      },
      {
        href: "/admin/produits/a-completer",
        title: "Matières à compléter",
        text: "Matières de la semaine sans fournisseur ou sans poids de colis",
      },
    ],
  },
  {
    id: "saisie",
    title: "2. Ce que les équipes voient à la saisie",
    text: "Listes proposées pendant la déclaration d'une perte",
    entries: [
      {
        href: "/admin/causes",
        title: "Causes",
        text: "Causes par zone, propositions des équipes à valider, famille et caractère évitable",
      },
      {
        href: "/admin/destinations",
        title: "Destinations",
        text: "Où partent les pertes : compost, don, retour fournisseur… ; n° de poubelle",
      },
      { href: "/admin/zones", title: "Zones et postes", text: "Renommer, ajouter ou désactiver un poste" },
      {
        href: "/admin/tares",
        title: "Gastros et tares",
        text: "Poids des gastros et des échelles, à partir d'une date",
      },
    ],
  },
  {
    id: "produits",
    title: "3. Produits et achats",
    text: "Matières, encas, fournisseurs et rangement",
    entries: [
      {
        href: "/admin/produits",
        title: "Produits",
        text: "Articles saisis à la main à valider, saisies « hors liste », fiches : prix datés, colis, encas",
      },
      {
        href: "/admin/fournisseurs",
        title: "Fournisseurs",
        text: "Fournisseurs saisis à la main à valider, renommer, voir leurs matières",
      },
      {
        href: "/admin/stockage-matieres",
        title: "Lieux de stockage des matières",
        text: "Catégorie Melba → lieu de Stockage, pour la saisie",
      },
    ],
  },
  {
    id: "organisation",
    title: "4. Équipes, comptes et calendrier",
    text: "Qui saisit, où, et quels jours",
    entries: [
      {
        href: "/admin/comptes",
        title: "Comptes",
        text: "Créer un compte, réinitialiser un mot de passe, désactiver, choisir ses zones",
      },
      {
        href: "/admin/equipes",
        title: "Équipes par semaine",
        text: "Désactiver une équipe pendant une semaine creuse",
      },
      {
        href: "/admin/calendrier",
        title: "Jours de production",
        text: "Retirer un jour férié, ajouter un samedi travaillé",
      },
    ],
  },
  {
    id: "couts",
    title: "5. Coûts et environnement",
    text: "Ce qui sert à chiffrer les pertes en euros et en CO2e",
    entries: [
      {
        href: "/admin/emballages",
        title: "Emballages et consommables",
        text: "Coûts unitaires datés, emballages par portion",
      },
      {
        href: "/admin/objectifs",
        title: "Objectifs par zone",
        text: "Au plus N kg de pertes par semaine, zone par zone ; suivi dans Statistiques → Objectifs",
      },
      {
        href: "/admin/couts-manquants",
        title: "Coûts manquants",
        text: "Pertes enregistrées sans coût : les compléter quand le prix ou le tome est arrivé",
      },
      {
        href: "/admin/main-oeuvre",
        title: "Main-d'œuvre",
        text: "Coût horaire moyen par zone (non imputé aux pertes)",
      },
      {
        href: "/admin/facteurs-co2",
        title: "Facteurs d'émission (CO2e)",
        text: "Familles alimentaires et facteurs Agribalyse, à valider",
      },
      {
        href: "/admin/facteurs-co2/ingredients",
        title: "Rattachement des ingrédients",
        text: "Ingrédients Melba → familles alimentaires, après chaque nouveau tome",
      },
    ],
  },
  {
    id: "suivi",
    title: "6. Alertes et contrôle",
    text: "Réglages des alertes et traces de ce qui a été fait",
    entries: [
      {
        href: "/admin/alertes",
        title: "Seuils des alertes",
        text: "Pertes inhabituelles, causes récurrentes, tendance stable",
      },
      { href: "/journal", title: "Journal d'audit", text: "Qui a fait quoi et quand, avant et après" },
    ],
  },
];

export default function AdminPage() {
  return (
    <>
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Administration</h1>
      <nav aria-label="Familles" className="flex flex-wrap gap-2">
        {FAMILIES.map((f) => (
          <a
            key={f.id}
            href={`#${f.id}`}
            className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-brun-700 shadow-sm"
          >
            {f.title.replace(/^\d+\. /, "")}
          </a>
        ))}
      </nav>
      {FAMILIES.map((f) => (
        <section key={f.id} id={f.id} aria-labelledby={`${f.id}-titre`} className="flex scroll-mt-4 flex-col gap-2">
          <div>
            <h2 id={`${f.id}-titre`} className="text-xl font-bold text-rouge-700">
              {f.title}
            </h2>
            <p className="text-sm text-slate-600">{f.text}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {f.entries.map((s) => (
              <Link key={s.href} href={s.href} className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm">
                <span className="text-lg font-semibold">{s.title}</span>
                <span className="text-sm text-slate-600">{s.text}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
