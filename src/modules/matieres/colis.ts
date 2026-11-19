/**
 * Colis fournisseur d'un produit proposés à la saisie en Réception et en Stockage (règle R25) : le dernier colis lu
 * dans les bons de chaque fournisseur et les colis saisis à la main, avec leur poids en kg. Un colis dont le poids
 * n'est pas calculable (contenu inconnu, vrac au kg, pièces sans poids) n'est pas proposé. Le dernier colis de chaque
 * fournisseur reste valable d'une semaine à l'autre, jusqu'à un bon qui le change.
 */
import { eq, inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { isLooseByKg, packagingKg } from "@/domain/saisie-mesure";

export interface PackagingOption {
  /** « bon_commande:<fournisseur> » ou « manuel:<fournisseur> ». */
  key: string;
  source: "bon_commande" | "manuel";
  supplier: string;
  label: string | null;
  kg: number;
}

/** Colis convertibles en kg, par produit (tous les produits, ou ceux demandés). */
export async function packagingOptions(
  db: Db,
  productIds?: readonly string[],
): Promise<Map<string, PackagingOption[]>> {
  if (productIds && productIds.length === 0) return new Map();
  const byIds = <T>(col: T) => (productIds ? inArray(col as never, [...productIds]) : undefined);
  const [fromOrders, manual] = await Promise.all([
    db
      .select({
        productId: s.supplierProducts.productId,
        supplierId: s.supplierProducts.supplierId,
        supplier: s.suppliers.name,
        packagingLabel: s.supplierProducts.packagingLabel,
        contentQuantity: s.supplierProducts.contentQuantity,
        contentUnit: s.supplierProducts.contentUnit,
        name: s.products.name,
        unitWeightKg: s.products.unitWeightKg,
        densityKgPerL: s.products.densityKgPerL,
        date: s.supplierProducts.lastDeliveryDate,
      })
      .from(s.supplierProducts)
      .innerJoin(s.suppliers, eq(s.supplierProducts.supplierId, s.suppliers.id))
      .innerJoin(s.products, eq(s.supplierProducts.productId, s.products.id))
      .where(byIds(s.supplierProducts.productId)),
    db
      .select({
        productId: s.manualPackagings.productId,
        supplierId: s.manualPackagings.supplierId,
        supplier: s.suppliers.name,
        packagingLabel: s.manualPackagings.packagingLabel,
        contentQuantity: s.manualPackagings.contentQuantity,
        contentUnit: s.manualPackagings.contentUnit,
        name: s.products.name,
        unitWeightKg: s.products.unitWeightKg,
        densityKgPerL: s.products.densityKgPerL,
      })
      .from(s.manualPackagings)
      .innerJoin(s.suppliers, eq(s.manualPackagings.supplierId, s.suppliers.id))
      .innerJoin(s.products, eq(s.manualPackagings.productId, s.products.id))
      .where(byIds(s.manualPackagings.productId)),
  ]);
  const map = new Map<string, PackagingOption[]>();
  const add = (productId: string, o: PackagingOption) => map.set(productId, [...(map.get(productId) ?? []), o]);
  // Le colis du dernier bon livré en premier, puis les colis saisis à la main.
  for (const r of [...fromOrders].sort((a, b) => b.date.localeCompare(a.date))) {
    const kg = packagingKg(r, r);
    if (kg != null)
      add(r.productId, {
        key: `bon_commande:${r.supplierId}`,
        source: "bon_commande",
        supplier: r.supplier,
        label: r.packagingLabel,
        kg,
      });
  }
  for (const r of manual) {
    const kg = packagingKg(r, r);
    if (kg != null)
      add(r.productId, {
        key: `manuel:${r.supplierId}`,
        source: "manuel",
        supplier: r.supplier,
        label: r.packagingLabel,
        kg,
      });
  }
  return map;
}

export interface ProductSupplier {
  supplier: string;
  /** Intitulé du colis (dernier bon, sinon colis saisi à la main). */
  label: string | null;
  /** Vendu au kg (vrac) : pas de colis à peser, le fournisseur suffit. */
  looseByKg: boolean;
}

/**
 * Fournisseur habituel de chaque produit (décision du 19/11/2026) : celui du dernier bon livré, sinon celui d'un colis
 * saisi à la main. Montré même quand le poids du colis n'est pas connu (vrac au kg, colis à compléter).
 */
export async function productSuppliers(db: Db): Promise<Map<string, ProductSupplier>> {
  const [fromOrders, manual] = await Promise.all([
    db
      .select({
        productId: s.supplierProducts.productId,
        supplier: s.suppliers.name,
        packagingLabel: s.supplierProducts.packagingLabel,
        contentQuantity: s.supplierProducts.contentQuantity,
        contentUnit: s.supplierProducts.contentUnit,
        date: s.supplierProducts.lastDeliveryDate,
      })
      .from(s.supplierProducts)
      .innerJoin(s.suppliers, eq(s.supplierProducts.supplierId, s.suppliers.id)),
    db
      .select({
        productId: s.manualPackagings.productId,
        supplier: s.suppliers.name,
        packagingLabel: s.manualPackagings.packagingLabel,
      })
      .from(s.manualPackagings)
      .innerJoin(s.suppliers, eq(s.manualPackagings.supplierId, s.suppliers.id)),
  ]);
  const map = new Map<string, ProductSupplier>();
  for (const r of [...fromOrders].sort((a, b) => b.date.localeCompare(a.date)))
    if (!map.has(r.productId))
      map.set(r.productId, { supplier: r.supplier, label: r.packagingLabel, looseByKg: isLooseByKg(r) });
  for (const r of manual)
    if (!map.has(r.productId))
      map.set(r.productId, { supplier: r.supplier, label: r.packagingLabel, looseByKg: false });
  return map;
}
