import Link from "next/link";

export const metadata = { title: "Administration — Pertes" };

const SECTIONS = [
  { href: "/admin/comptes", title: "Comptes", text: "Créer un compte, réinitialiser un mot de passe, désactiver" },
  { href: "/admin/equipes", title: "Équipes par semaine", text: "Désactiver une équipe pendant une semaine creuse" },
  { href: "/admin/import", title: "Import de la semaine", text: "Tome Melba + plan de production, chaque mardi" },
  { href: "/admin/produits", title: "Produits", text: "Liste des produits et saisies « hors liste » à rattacher" },
  { href: "/admin/tares", title: "Gastros et tares", text: "Poids des gastros et des échelles, à partir d'une date" },
  { href: "/admin/calendrier", title: "Jours de production", text: "Retirer un jour férié, ajouter un samedi travaillé" },
  { href: "/admin/destinations", title: "Destinations", text: "Où partent les pertes : compost, don, vente…" },
  { href: "/admin/zones", title: "Zones et postes", text: "Renommer, ajouter ou désactiver un poste" },
  { href: "/admin/causes", title: "Causes", text: "Gérer les causes par zone et valider les propositions" },
];

export default function AdminPage() {
  return (
    <>
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Administration</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm">
            <span className="text-lg font-semibold">{s.title}</span>
            <span className="text-sm text-slate-600">{s.text}</span>
          </Link>
        ))}
      </div>
      <Link href="/journal" className="text-teal-800 underline">
        Consulter le journal d&apos;audit
      </Link>
    </>
  );
}
