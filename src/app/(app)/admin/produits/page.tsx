import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { listEnteredArticles, listProductsForAdmin, listUnlistedGroups } from "@/modules/admin/products";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { pricesInForce } from "@/modules/matieres/referentiel";
import { listSuppliers, placementChoices, suppliersByProduct } from "@/modules/matieres/fiche";
import { referenceDensity, referenceDensityLabel } from "@/domain/densites";
import { EnteredArticles } from "./entered-articles";
import { ProductsAdmin } from "./products-admin";

/** Densité tirée du tableau de référence des liquides (et non saisie à la main) : son origine. */
const densityReferenceOf = (name: string, density: number | null) => {
  const ref = density == null ? null : referenceDensity(name);
  return ref && ref.densityKgPerL === density ? referenceDensityLabel(ref) : null;
};

export const metadata = { title: "Produits — Administration" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ fournisseur?: string }> }) {
  const { fournisseur } = await searchParams;
  const admin = await requireUser();
  const today = toProductionLocalDate(new Date());
  const [products, groups, units, prices, choices, suppliers, supplierIdsOf, entered] = await Promise.all([
    listProductsForAdmin(db, admin),
    listUnlistedGroups(db, admin),
    db
      .select({ code: s.units.code, label: s.units.label })
      .from(s.units)
      .where(eq(s.units.active, true))
      .orderBy(asc(s.units.code)),
    pricesInForce(db, today),
    placementChoices(db),
    listSuppliers(db, admin),
    suppliersByProduct(db),
    listEnteredArticles(db, admin),
  ]);
  const categoryOf = new Map(choices.categories.map((c) => [c.id, c]));
  const placeName = new Map(choices.subzones.map((z) => [z.id, z.name]));
  /** Lieu de stockage effectif : celui du produit, sinon celui de sa catégorie Melba. */
  const storageOf = (p: (typeof products)[number]) => {
    const own = p.storageSubzoneId ? placeName.get(p.storageSubzoneId) : null;
    if (own) return { name: own, own: true };
    const fromCategory = p.materialCategoryId ? categoryOf.get(p.materialCategoryId)?.storageSubzoneId : null;
    return fromCategory ? { name: placeName.get(fromCategory) ?? null, own: false } : null;
  };
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Produits</h1>
      <Link href="/admin/produits/a-completer" className="self-start font-medium text-rouge-700 underline">
        Matières de la semaine à compléter (fournisseur, poids du colis)
      </Link>
      <EnteredArticles
        articles={entered}
        candidates={products
          .filter((p) => p.active && !p.toValidate)
          .map((p) => ({ id: p.id, name: p.variant ? `${p.name} – ${p.variant}` : p.name, category: p.category }))}
      />
      <ProductsAdmin
        units={units}
        materialCategories={choices.categories.map((c) => ({ id: c.id, name: c.name }))}
        suppliers={suppliers.map((x) => ({ id: x.id, name: x.name }))}
        initialSupplier={suppliers.some((x) => x.id === fournisseur) ? fournisseur : undefined}
        groups={groups.map(({ declarationIds: _ids, ...g }) => g)}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          code: p.code,
          variant: p.variant,
          snackFamily: p.snackFamily,
          defaultUnit: p.defaultUnit,
          unitWeightKg: p.unitWeightKg,
          densityKgPerL: p.densityKgPerL,
          densityReference: densityReferenceOf(p.name, p.densityKgPerL),
          source: p.source,
          active: p.active,
          melba: p.externalId?.startsWith("melba:") ?? false,
          materialCategoryId: p.materialCategoryId,
          materialCategory: p.materialCategoryId ? (categoryOf.get(p.materialCategoryId)?.name ?? null) : null,
          storage: storageOf(p),
          supplierIds: supplierIdsOf.get(p.id) ?? [],
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
