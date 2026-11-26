import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { referenceDensity, referenceDensityLabel } from "@/domain/densites";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { PACKAGING_CONTENT_UNITS, placementChoices, productSheet, supplierChoices } from "@/modules/matieres/fiche";
import { ProductSheet } from "./product-sheet";

export const metadata = { title: "Fiche produit — Administration" };

/** Fiche d'un produit (docs/PHASE6.md, étape 6.11). */
export default async function ProductSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireUser();
  const today = toProductionLocalDate(new Date());
  const [sheet, choices, units, suppliers] = await Promise.all([
    productSheet(db, admin, id, today),
    placementChoices(db),
    db
      .select({ code: s.units.code, label: s.units.label })
      .from(s.units)
      .where(eq(s.units.active, true))
      .orderBy(asc(s.units.code)),
    supplierChoices(db),
  ]);
  if (!sheet) notFound();
  const { product: p } = sheet;
  const ref = p.densityKgPerL == null ? null : referenceDensity(p.name);
  return (
    <>
      <Link href="/admin/produits" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Produits
      </Link>
      <h1 className="text-2xl font-bold">
        {p.name}
        {p.variant && <span className="font-normal text-slate-600"> ({p.variant})</span>}
      </h1>
      <p className="text-slate-600">
        {PRODUCT_CATEGORY_LABELS[p.category]}
        {p.externalId?.startsWith("melba:") && " · matière Melba"}
        {!p.active && " · désactivé"}
      </p>
      {p.toValidate && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-amber-950">
          Article saisi à la main en Réception ou en Stockage : à valider (Administration → Produits, « Articles saisis
          à la main »). Corrigez ici son nom, son poids ou son prix si besoin.
        </p>
      )}
      <ProductSheet
        today={today}
        units={units}
        categories={choices.categories}
        subzones={choices.subzones}
        product={{
          id: p.id,
          name: p.name,
          category: p.category,
          code: p.code,
          variant: p.variant,
          defaultUnit: p.defaultUnit,
          unitWeightKg: p.unitWeightKg,
          densityKgPerL: p.densityKgPerL,
          densityReference: ref && ref.densityKgPerL === p.densityKgPerL ? referenceDensityLabel(ref) : null,
          active: p.active,
          materialCategoryId: p.materialCategoryId,
          storageSubzoneId: p.storageSubzoneId,
          comment: p.comment,
        }}
        packagings={sheet.packagings}
        manualPackagings={sheet.manualPackagings.map(({ updatedAt, ...k }) => ({
          ...k,
          updatedOn: toProductionLocalDate(updatedAt),
        }))}
        suppliers={suppliers}
        contentUnits={[...PACKAGING_CONTENT_UNITS]}
        prices={sheet.prices}
      />
    </>
  );
}
