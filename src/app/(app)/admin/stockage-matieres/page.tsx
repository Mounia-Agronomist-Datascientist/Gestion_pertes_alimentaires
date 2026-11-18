import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { categoriesForSetting, storageSubzones } from "@/modules/matieres/semaine";
import { CategoryStorageForm } from "./category-storage-form";

export const metadata = { title: "Lieux de stockage des matières — Administration" };

/** Réglage « catégorie Melba → sous-zone de Stockage » (docs/PHASE6.md, étape 6.10). */
export default async function MaterialStoragePage() {
  const admin = await requireUser();
  const [{ categories, uncategorized }, subzones] = await Promise.all([
    categoriesForSetting(db, admin),
    storageSubzones(db),
  ]);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Lieux de stockage des matières</h1>
      <p className="text-slate-600">
        Chaque catégorie Melba des bons de commande est rangée dans un lieu de Stockage. En Stockage, la saisie propose
        d&apos;abord les matières de la semaine rangées dans le lieu choisi ; les matières dont la catégorie n&apos;a
        pas de lieu restent proposées à part. En Réception, toutes les matières de la semaine sont proposées.
      </p>
      {categories.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 shadow-sm">
          Aucune catégorie pour l&apos;instant : elles arrivent avec les bons de commande (Administration → Import).
        </p>
      ) : (
        <CategoryStorageForm categories={categories} subzones={subzones} />
      )}
      {uncategorized > 0 && (
        <p className="text-sm text-slate-600">
          {uncategorized} matière{uncategorized > 1 ? "s" : ""} sans catégorie Melba (jamais commandée
          {uncategorized > 1 ? "s" : ""} dans un bon déposé) : proposée{uncategorized > 1 ? "s" : ""} à part dans chaque
          lieu de Stockage.
        </p>
      )}
    </>
  );
}
