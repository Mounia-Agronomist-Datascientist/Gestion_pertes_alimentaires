import Link from "next/link";
import { db } from "@/db/client";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { incompleteWeekMaterials } from "@/modules/matieres/completude";

export const metadata = { title: "Matières à compléter — Administration" };

export default async function IncompleteMaterialsPage() {
  const admin = await requireUser();
  const { weeks, checked, incomplete } = await incompleteWeekMaterials(db, admin, toProductionLocalDate(new Date()));
  const groups = [
    {
      reason: "sans_fournisseur",
      title: "Sans fournisseur",
      help: "Absentes des bons de commande importés : achetées ailleurs, ou nommées autrement dans les bons. Sur la fiche, ajoutez un colis avec son fournisseur (existant ou nouveau).",
    },
    {
      reason: "poids_colis_inconnu",
      title: "Poids du colis inconnu",
      help: "Le bon ne dit pas ce que pèse le colis (« Carton / 10 Sachet ») ou il manque la densité d'un liquide. Sur la fiche, ajoutez le colis avec son contenu total (ex. « Carton » de 5 kg).",
    },
  ] as const;
  return (
    <>
      <Link href="/admin/produits" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Produits
      </Link>
      <h1 className="text-2xl font-bold">Matières à compléter</h1>
      <p className="text-slate-700">
        Matières des semaines {weeks.map((n) => `S${n}`).join(" et ") || "—"} ({checked} matières) : chacune doit avoir
        son fournisseur et le poids de son colis pour la saisie en Réception. Ce que vous saisissez sur la fiche reste
        valable les semaines suivantes, jusqu&apos;à un bon qui change de fournisseur ou de colis.
      </p>
      {incomplete.length === 0 ? (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
          Tout est complet.
        </p>
      ) : (
        groups.map((g) => {
          const list = incomplete.filter((m) => m.reason === g.reason);
          if (!list.length) return null;
          return (
            <section key={g.reason} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">
                {g.title} ({list.length})
              </h2>
              <p className="text-sm text-slate-600">{g.help}</p>
              <ul className="flex flex-col gap-2">
                {list.map((m) => (
                  <li key={m.productId}>
                    <Link
                      href={`/admin/produits/${m.productId}`}
                      className="flex flex-col rounded-2xl bg-white p-3 shadow-sm"
                    >
                      <span className="font-medium">{m.name}</span>
                      <small className="text-slate-500">
                        {m.weeks.map((n) => `S${n}`).join(", ")}
                        {m.supplier && ` · ${m.supplier}`}
                        {m.packagingLabel && ` · ${m.packagingLabel}`}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
