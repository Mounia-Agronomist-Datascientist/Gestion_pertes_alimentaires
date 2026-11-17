import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { listProductsForAdmin, listUnlistedGroups } from "@/modules/admin/products";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { pricesInForce } from "@/modules/matieres/referentiel";
import { ProductsAdmin } from "./products-admin";

export const metadata = { title: "Produits — Administration" };

export default async function ProductsPage() {
  const admin = await requireUser();
  const today = toProductionLocalDate(new Date());
  const [products, groups, units, prices] = await Promise.all([
    listProductsForAdmin(db, admin),
    listUnlistedGroups(db, admin),
    db.select({ code: s.units.code, label: s.units.label }).from(s.units).where(eq(s.units.active, true)).orderBy(asc(s.units.code)),
    pricesInForce(db, today),
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
          melba: p.externalId?.startsWith("melba:") ?? false,
          price: prices.get(p.id)
            ? {
                perKgEur: prices.get(p.id)!.current.perKgEur,
                perUnitEur: prices.get(p.id)!.current.perUnitEur,
                unit: prices.get(p.id)!.current.unit,
                source: prices.get(p.id)!.current.source,
                validFrom: prices.get(p.id)!.current.validFrom,
                versions: prices.get(p.id)!.versions,
              }
            : null,
        }))}
      />
    </>
  );
}
