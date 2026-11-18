/**
 * Administration → Produits, fiche d'un produit (docs/PHASE6.md, étape 6.11) : catégorie Melba et lieu de stockage
 * propre, colis fournisseur (lus dans les bons de commande), versions de prix et correction manuelle datée ;
 * fournisseurs. Les imports suivants ne touchent à aucun de ces réglages (règle R23) : une matière est retrouvée par
 * son identifiant Melba, jamais par son nom.
 */
import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { priceInForce } from "@/domain/matieres";
import { tomeKey } from "@/modules/imports/tome/parse-tome";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";

export class ProductSheetError extends Error {}

/** Fiche d'un produit, ou null s'il n'existe pas. */
export async function productSheet(db: Db, admin: AuthUser, productId: string, today: string) {
  requirePermission(admin, "referentiel.manage");
  if (!z.uuid().safeParse(productId).success) return null;
  const [product] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!product) return null;
  const [category, packagings, manualPackagings, prices, orderLines] = await Promise.all([
    product.materialCategoryId
      ? db.select().from(s.materialCategories).where(eq(s.materialCategories.id, product.materialCategoryId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        supplierId: s.suppliers.id,
        supplier: s.suppliers.name,
        supplierCode: s.supplierProducts.supplierCode,
        packagingLabel: s.supplierProducts.packagingLabel,
        contentQuantity: s.supplierProducts.contentQuantity,
        contentUnit: s.supplierProducts.contentUnit,
        lastDeliveryDate: s.supplierProducts.lastDeliveryDate,
      })
      .from(s.supplierProducts)
      .innerJoin(s.suppliers, eq(s.supplierProducts.supplierId, s.suppliers.id))
      .where(eq(s.supplierProducts.productId, productId))
      .orderBy(desc(s.supplierProducts.lastDeliveryDate)),
    db
      .select({
        id: s.manualPackagings.id,
        supplierId: s.suppliers.id,
        supplier: s.suppliers.name,
        supplierCode: s.manualPackagings.supplierCode,
        packagingLabel: s.manualPackagings.packagingLabel,
        contentQuantity: s.manualPackagings.contentQuantity,
        contentUnit: s.manualPackagings.contentUnit,
        updatedAt: s.manualPackagings.updatedAt,
      })
      .from(s.manualPackagings)
      .innerJoin(s.suppliers, eq(s.manualPackagings.supplierId, s.suppliers.id))
      .where(eq(s.manualPackagings.productId, productId))
      .orderBy(asc(s.suppliers.name)),
    db.select().from(s.productPrices).where(eq(s.productPrices.productId, productId)),
    db
      .select({ orderId: s.purchaseOrders.id, number: s.purchaseOrders.number, supplier: s.suppliers.name })
      .from(s.purchaseOrders)
      .innerJoin(s.suppliers, eq(s.purchaseOrders.supplierId, s.suppliers.id))
      .innerJoin(s.purchaseOrderLines, eq(s.purchaseOrderLines.orderId, s.purchaseOrders.id))
      .where(eq(s.purchaseOrderLines.productId, productId)),
  ]);
  const importIds = [...new Set(prices.map((p) => p.weeklyImportId).filter((id): id is string => id != null))];
  const weeks = importIds.length
    ? await db
        .select({ importId: s.weeklyImports.id, year: s.productionWeeks.year, number: s.productionWeeks.number })
        .from(s.weeklyImports)
        .innerJoin(s.productionWeeks, eq(s.weeklyImports.productionWeekId, s.productionWeeks.id))
        .where(inArray(s.weeklyImports.id, importIds))
    : [];
  const orderOf = new Map(orderLines.map((o) => [o.orderId, o]));
  const weekOf = new Map(weeks.map((w) => [w.importId, w]));
  const current = priceInForce(prices, today);
  return {
    product,
    category,
    packagings,
    manualPackagings,
    prices: prices
      .map((p) => ({
        id: p.id,
        source: p.source,
        validFrom: p.validFrom,
        unit: p.unit,
        perKgEur: p.perKgEur,
        perUnitEur: p.perUnitEur,
        order: p.purchaseOrderId ? (orderOf.get(p.purchaseOrderId) ?? null) : null,
        week: p.weeklyImportId ? (weekOf.get(p.weeklyImportId) ?? null) : null,
        inForce: current?.id === p.id,
      }))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom) || a.source.localeCompare(b.source)),
  };
}

/** Catégories Melba et sous-zones de Stockage (choix de la fiche). */
export async function placementChoices(db: Db) {
  const [categories, subzones] = await Promise.all([
    db.select({ id: s.materialCategories.id, name: s.materialCategories.name, storageSubzoneId: s.materialCategories.storageSubzoneId }).from(s.materialCategories).orderBy(asc(s.materialCategories.name)),
    db
      .select({ id: s.subzones.id, name: s.subzones.name })
      .from(s.subzones)
      .innerJoin(s.zones, eq(s.subzones.zoneId, s.zones.id))
      .where(and(eq(s.zones.code, "STOCKAGE"), eq(s.subzones.active, true)))
      .orderBy(asc(s.subzones.displayOrder)),
  ]);
  return { categories, subzones };
}

const placementSchema = z.object({ materialCategoryId: z.uuid().nullable(), storageSubzoneId: z.uuid().nullable() });

/**
 * Catégorie Melba et lieu de stockage propre d'un produit (null = celui de sa catégorie). Jamais repris par un
 * import : un bon ne renseigne la catégorie que d'une matière qui n'en a pas.
 */
export async function setProductPlacement(db: Db, admin: AuthUser, productId: string, raw: unknown) {
  requirePermission(admin, "referentiel.manage");
  const parsed = placementSchema.safeParse(raw);
  if (!parsed.success) throw new ProductSheetError("Réglage illisible.");
  const { materialCategoryId, storageSubzoneId } = parsed.data;
  const [before] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!before) throw new ProductSheetError("Produit introuvable.");
  if (materialCategoryId) {
    const [c] = await db.select({ id: s.materialCategories.id }).from(s.materialCategories).where(eq(s.materialCategories.id, materialCategoryId));
    if (!c) throw new ProductSheetError("Catégorie inconnue.");
  }
  if (storageSubzoneId && !(await placementChoices(db)).subzones.some((z) => z.id === storageSubzoneId)) {
    throw new ProductSheetError("Lieu de stockage inconnu.");
  }
  if (before.materialCategoryId === materialCategoryId && before.storageSubzoneId === storageSubzoneId) return false;
  await db.update(s.products).set({ materialCategoryId, storageSubzoneId, updatedAt: new Date() }).where(eq(s.products.id, productId));
  await writeAudit(db, {
    userId: admin.id,
    action: "set_product_placement",
    entity: "product",
    entityId: productId,
    before: { materialCategoryId: before.materialCategoryId, storageSubzoneId: before.storageSubzoneId },
    after: { materialCategoryId, storageSubzoneId },
  });
  return true;
}

const euro = z.preprocess(
  (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(",", ".").replace(/\s/g, "")) : v),
  z.number({ message: "Prix invalide" }).positive("Le prix doit être positif").max(100_000, "Prix trop élevé").nullable(),
);

const manualPriceSchema = z
  .object({
    validFrom: z.iso.date({ message: "Date invalide" }),
    perKgEur: euro,
    perUnitEur: euro,
    unit: z
      .string()
      .trim()
      .max(40)
      .transform((v) => v || null)
      .nullable()
      .optional(),
  })
  .refine((p) => p.perKgEur != null || p.perUnitEur != null, { message: "Indiquez un prix au kg ou à l'unité." });

/**
 * Correction manuelle du prix : une nouvelle version datée (règle R23 : elle compte comme un prix d'achat, la plus
 * récente en vigueur à la date d'une perte fait foi). Les pertes déjà enregistrées gardent leur coût figé.
 */
export async function addManualPrice(db: Db, admin: AuthUser, productId: string, raw: unknown) {
  requirePermission(admin, "referentiel.manage");
  const parsed = manualPriceSchema.safeParse(raw);
  if (!parsed.success) throw new ProductSheetError(parsed.error.issues[0]?.message ?? "Prix invalide.");
  const p = parsed.data;
  const [product] = await db.select({ id: s.products.id }).from(s.products).where(eq(s.products.id, productId));
  if (!product) throw new ProductSheetError("Produit introuvable.");
  const [same] = await db
    .select({ id: s.productPrices.id })
    .from(s.productPrices)
    .where(and(eq(s.productPrices.productId, productId), eq(s.productPrices.source, "manuel"), eq(s.productPrices.validFrom, p.validFrom)));
  if (same) throw new ProductSheetError("Un prix saisi à la main existe déjà à cette date : retirez-le d'abord.");
  const [created] = await db
    .insert(s.productPrices)
    .values({
      productId,
      source: "manuel",
      validFrom: p.validFrom,
      unit: p.perUnitEur != null ? (p.unit ?? "unité") : null,
      perKgEur: p.perKgEur,
      perUnitEur: p.perUnitEur,
      createdBy: admin.id,
    })
    .returning();
  await writeAudit(db, { userId: admin.id, action: "add_manual_price", entity: "product_price", entityId: created!.id, after: created });
  return created!;
}

/**
 * Retrait d'un prix saisi à la main (erreur de saisie). Les prix des tomes et des bons ne se retirent pas. Les pertes
 * déjà enregistrées gardent le coût figé à leur enregistrement.
 */
export async function removeManualPrice(db: Db, admin: AuthUser, productId: string, priceId: string) {
  requirePermission(admin, "referentiel.manage");
  if (!z.uuid().safeParse(priceId).success) throw new ProductSheetError("Prix introuvable.");
  const [price] = await db.select().from(s.productPrices).where(and(eq(s.productPrices.id, priceId), eq(s.productPrices.productId, productId)));
  if (!price) throw new ProductSheetError("Prix introuvable.");
  if (price.source !== "manuel") throw new ProductSheetError("Seul un prix saisi à la main peut être retiré.");
  await db.delete(s.productPrices).where(eq(s.productPrices.id, priceId));
  await writeAudit(db, { userId: admin.id, action: "remove_manual_price", entity: "product_price", entityId: priceId, before: price });
}

// ─── Fournisseurs ──────────────────────────────────────────────────────────────

/** Fournisseurs des bons déposés, avec leur nombre de bons, de matières et leur dernière livraison. */
export async function listSuppliers(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const [suppliers, orders, fromOrders, fromManual] = await Promise.all([
    db.select().from(s.suppliers).orderBy(asc(s.suppliers.name)),
    db
      .select({ supplierId: s.purchaseOrders.supplierId, orders: count(), lastDelivery: max(s.purchaseOrders.deliveryDate) })
      .from(s.purchaseOrders)
      .groupBy(s.purchaseOrders.supplierId),
    db.select({ supplierId: s.supplierProducts.supplierId, productId: s.supplierProducts.productId }).from(s.supplierProducts),
    db.select({ supplierId: s.manualPackagings.supplierId, productId: s.manualPackagings.productId }).from(s.manualPackagings),
  ]);
  const ordersOf = new Map(orders.map((o) => [o.supplierId, o]));
  // Matières d'un fournisseur : commandées dans ses bons ou avec un colis saisi à la main, une fois chacune.
  const productsOf = new Map<string, Set<string>>();
  for (const r of [...fromOrders, ...fromManual]) productsOf.set(r.supplierId, (productsOf.get(r.supplierId) ?? new Set()).add(r.productId));
  const materialsOf = new Map([...productsOf].map(([id, set]) => [id, set.size]));
  return suppliers.map((x) => ({
    id: x.id,
    name: x.name,
    orders: ordersOf.get(x.id)?.orders ?? 0,
    lastDelivery: ordersOf.get(x.id)?.lastDelivery ?? null,
    materials: materialsOf.get(x.id) ?? 0,
  }));
}

/** Nom affiché d'un fournisseur ; un bon déposé ensuite le retrouve par sa clé (nom du fichier), sans le renommer. */
export async function renameSupplier(db: Db, admin: AuthUser, supplierId: string, rawName: unknown) {
  requirePermission(admin, "referentiel.manage");
  const name = z.string().trim().min(2, "Le nom est trop court.").max(120).safeParse(rawName);
  if (!name.success) throw new ProductSheetError(name.error.issues[0]?.message ?? "Nom invalide.");
  const [before] = await db.select().from(s.suppliers).where(eq(s.suppliers.id, supplierId));
  if (!before) throw new ProductSheetError("Fournisseur introuvable.");
  if (before.name === name.data) return;
  await db.update(s.suppliers).set({ name: name.data, updatedAt: new Date() }).where(eq(s.suppliers.id, supplierId));
  await writeAudit(db, { userId: admin.id, action: "rename_supplier", entity: "supplier", entityId: supplierId, before: { name: before.name }, after: { name: name.data } });
}

/** Fournisseurs de chaque produit (filtre de la liste des produits). */
export async function suppliersByProduct(db: Db) {
  const rows = await Promise.all([
    db.select({ productId: s.supplierProducts.productId, supplierId: s.supplierProducts.supplierId }).from(s.supplierProducts),
    db.select({ productId: s.manualPackagings.productId, supplierId: s.manualPackagings.supplierId }).from(s.manualPackagings),
  ]);
  const map = new Map<string, string[]>();
  for (const r of rows.flat()) if (!map.get(r.productId)?.includes(r.supplierId)) map.set(r.productId, [...(map.get(r.productId) ?? []), r.supplierId]);
  return map;
}

// ─── Colis saisis à la main (décision du 18/11/2026) ───────────────────────────

/** Unités du contenu d'un colis saisi (mêmes notations que les bons de commande). */
export const PACKAGING_CONTENT_UNITS = ["kg", "g", "L", "cL", "mL", "pièce(s)"] as const;

const optionalShortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const manualPackagingSchema = z
  .object({
    supplierId: z.uuid().nullable().optional(),
    /** Nouveau fournisseur : son nom seulement (aucun contact). */
    newSupplier: optionalShortText(120),
    supplierCode: optionalShortText(60),
    packagingLabel: z.string().trim().min(2, "Décrivez le colis (ex. carton de 6, sac de 10 kg).").max(120),
    contentQuantity: z.preprocess(
      (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(",", ".").replace(/\s/g, "")) : v),
      z.number({ message: "Contenu invalide" }).positive("Le contenu doit être positif").nullable(),
    ),
    contentUnit: z.enum(PACKAGING_CONTENT_UNITS).nullable().optional(),
  })
  .refine((p) => p.supplierId || (p.newSupplier && p.newSupplier.length >= 2), { message: "Choisissez le fournisseur ou tapez son nom." })
  .refine((p) => (p.contentQuantity == null) === (p.contentUnit == null), { message: "Indiquez le contenu et son unité, ou ni l'un ni l'autre." });

/**
 * Colis saisi à la main pour un produit chez un fournisseur : ajouté, ou remplacé s'il existe déjà pour ce
 * fournisseur. Gardé à côté du colis lu dans les bons, jamais remplacé par un bon. Information seulement.
 * Un nouveau fournisseur reçoit la clé que lui donneraient ses bons : ses bons déposés ensuite le retrouvent.
 */
export async function saveManualPackaging(db: Db, admin: AuthUser, productId: string, raw: unknown) {
  requirePermission(admin, "referentiel.manage");
  const parsed = manualPackagingSchema.safeParse(raw);
  if (!parsed.success) throw new ProductSheetError(parsed.error.issues[0]?.message ?? "Colis invalide.");
  const p = parsed.data;
  const [product] = await db.select({ id: s.products.id }).from(s.products).where(eq(s.products.id, productId));
  if (!product) throw new ProductSheetError("Produit introuvable.");
  return db.transaction(async (tx) => {
    let supplierId = p.supplierId ?? null;
    if (supplierId) {
      const [found] = await tx.select({ id: s.suppliers.id }).from(s.suppliers).where(eq(s.suppliers.id, supplierId));
      if (!found) throw new ProductSheetError("Fournisseur inconnu.");
    } else {
      const key = tomeKey(p.newSupplier!);
      if (!key) throw new ProductSheetError("Nom de fournisseur invalide.");
      const [existing] = await tx.select({ id: s.suppliers.id }).from(s.suppliers).where(eq(s.suppliers.key, key));
      if (existing) supplierId = existing.id;
      else {
        const [created] = await tx.insert(s.suppliers).values({ name: p.newSupplier!, key }).returning();
        await writeAudit(tx, { userId: admin.id, action: "create", entity: "supplier", entityId: created!.id, after: { name: created!.name } });
        supplierId = created!.id;
      }
    }
    const values = {
      supplierCode: p.supplierCode ?? null,
      packagingLabel: p.packagingLabel,
      contentQuantity: p.contentQuantity,
      contentUnit: p.contentUnit ?? null,
    };
    const [before] = await tx
      .select()
      .from(s.manualPackagings)
      .where(and(eq(s.manualPackagings.productId, productId), eq(s.manualPackagings.supplierId, supplierId)));
    const [saved] = before
      ? await tx.update(s.manualPackagings).set({ ...values, updatedAt: new Date() }).where(eq(s.manualPackagings.id, before.id)).returning()
      : await tx.insert(s.manualPackagings).values({ productId, supplierId, ...values, createdBy: admin.id }).returning();
    await writeAudit(tx, { userId: admin.id, action: before ? "update" : "create", entity: "manual_packaging", entityId: saved!.id, before: before ?? null, after: saved });
    return { packaging: saved!, replaced: before != null };
  });
}

/** Retrait d'un colis saisi à la main (dépassé ou faux). Les colis lus dans les bons ne se retirent pas. */
export async function removeManualPackaging(db: Db, admin: AuthUser, productId: string, packagingId: string) {
  requirePermission(admin, "referentiel.manage");
  if (!z.uuid().safeParse(packagingId).success) throw new ProductSheetError("Colis introuvable.");
  const [before] = await db
    .select()
    .from(s.manualPackagings)
    .where(and(eq(s.manualPackagings.id, packagingId), eq(s.manualPackagings.productId, productId)));
  if (!before) throw new ProductSheetError("Colis introuvable.");
  await db.delete(s.manualPackagings).where(eq(s.manualPackagings.id, packagingId));
  await writeAudit(db, { userId: admin.id, action: "delete", entity: "manual_packaging", entityId: packagingId, before });
}

/** Fournisseurs proposés pour un colis saisi. */
export async function supplierChoices(db: Db) {
  return db.select({ id: s.suppliers.id, name: s.suppliers.name }).from(s.suppliers).orderBy(asc(s.suppliers.name));
}
