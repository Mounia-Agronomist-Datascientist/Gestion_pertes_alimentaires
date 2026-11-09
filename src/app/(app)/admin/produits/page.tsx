import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { listProductsForAdmin, listUnlistedGroups } from "@/modules/admin/products";
import { requireUser } from "@/modules/auth/next-session";
import { ProductsAdmin } from "./products-admin";

export const metadata = { title: "Produits — Administration" };

export default async function ProductsPage() {
  const admin = await requireUser();
  const [products, groups, units] = await Promise.all([
    listProductsForAdmin(db, admin),
    listUnlistedGroups(db, admin),
    db.select({ code: s.units.code, label: s.units.label }).from(s.units).where(eq(s.units.active, true)).orderBy(asc(s.units.code)),
  ]);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Produits</h1>
      <ProductsAdmin
        units={units}
        groups={groups.map(({ declarationIds: _ids, ...g }) => g)}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          code: p.code,
          variant: p.variant,
          defaultUnit: p.defaultUnit,
          unitWeightKg: p.unitWeightKg,
          densityKgPerL: p.densityKgPerL,
          source: p.source,
          active: p.active,
        }))}
      />
    </>
  );
}
