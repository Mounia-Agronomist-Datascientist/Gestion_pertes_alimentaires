import Link from "next/link";

export const metadata = { title: "Administration — Pertes" };

const SECTIONS = [
  { href: "/admin/comptes", title: "Comptes", text: "Créer un compte, réinitialiser un mot de passe, désactiver" },
  { href: "/admin/equipes", title: "Équipes par semaine", text: "Désactiver une équipe pendant une semaine creuse" },
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
      <p className="text-sm text-slate-500">À venir : produits, tares des gastros, destinations, zones, calendrier.</p>
    </>
  );
}
