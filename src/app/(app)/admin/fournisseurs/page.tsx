import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { listSuppliers } from "@/modules/matieres/fiche";
import { SuppliersList } from "./suppliers-list";

export const metadata = { title: "Fournisseurs — Administration" };

/** Fournisseurs des bons de commande déposés (docs/PHASE6.md, étape 6.11). */
export default async function SuppliersPage() {
  const admin = await requireUser();
  const suppliers = await listSuppliers(db, admin);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Fournisseurs</h1>
      <p className="text-slate-600">
        Les fournisseurs arrivent avec les bons de commande (Administration → Import). Seul leur nom est gardé, jamais
        leurs contacts. Un nom modifié ici reste : un bon déposé ensuite retrouve le fournisseur par le nom de son
        fichier, sans le renommer.
      </p>
      {suppliers.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 shadow-sm">Aucun fournisseur pour l&apos;instant.</p>
      ) : (
        <SuppliersList suppliers={suppliers} />
      )}
    </>
  );
}
