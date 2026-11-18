/**
 * Enregistrement des bons de commande Melba (docs/PHASE6.md, étape 6.8). Les PDF sont lus dans le navigateur ;
 * seules les données lues arrivent ici, revérifiées.
 * - Fournisseur, catégorie Melba et matière (même clé que l'ingrédient du tome) retrouvés ou créés.
 * - Colis fournisseur : le dernier commandé chez chaque fournisseur.
 * - Prix d'achat : nouvelle version datée du jour de livraison quand il change (règle R23).
 * - Un bon redéposé (même numéro) remplace ses lignes et ses prix ; rien d'autre n'est effacé.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { purchaseLinePrice } from "@/domain/bons-commande";
import { melbaExternalId, priceInForce, samePrice } from "@/domain/matieres";
import { daysBetween } from "@/domain/semaine-production";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { isMouldLabel } from "@/modules/imports/merge";
import { applyReferenceDensities } from "@/modules/matieres/referentiel";
import { tomeKey } from "@/modules/imports/tome/parse-tome";

export class PurchaseOrderError extends Error {}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const amount = z.number().finite().nonnegative();

export const purchaseOrderSchema = z.object({
  fileName: text(300),
  number: z.string().regex(/^\d{8,20}$/),
  supplier: text(120),
  supplierLabel: text(200),
  subject: text(200).nullable(),
  week: z.number().int().min(1).max(53).nullable(),
  deliveryDate: isoDate,
  orderedOn: isoDate.nullable(),
  totalEur: amount.nullable(),
  warnings: z.array(z.string().max(500)).max(50),
  lines: z
    .array(
      z.object({
        position: z.number().int().positive(),
        designation: text(400),
        supplierCode: text(60).nullable(),
        category: text(120).nullable(),
        quantity: amount,
        packaging: z.object({ label: text(200), contentQuantity: amount.nullable(), contentUnit: text(80).nullable() }).nullable(),
        unitPriceEur: amount,
        priceUnit: text(120),
        totalEur: amount.nullable(),
      }),
    )
    .min(1)
    .max(300),
});
export const purchaseOrdersPayloadSchema = z.array(purchaseOrderSchema).min(1).max(60);
export type PurchaseOrderPayload = z.infer<typeof purchaseOrderSchema>;

export interface PurchaseOrdersResult {
  orders: number;
  replaced: number;
  lines: number;
  createdMaterials: number;
  newPrices: number;
  newSuppliers: number;
  /** Bons dont la semaine n'est pas dans le calendrier de production. */
  outsideCalendar: number;
}

/** Semaine de production d'un bon : le numéro lu, dans l'année la plus proche de la livraison. */
async function weekOf(db: Db, number: number | null, deliveryDate: string) {
  if (number == null) return null;
  const weeks = await db.select().from(s.productionWeeks).where(eq(s.productionWeeks.number, number));
  const best = weeks.sort((a, b) => Math.abs(daysBetween(a.startDate, deliveryDate)) - Math.abs(daysBetween(b.startDate, deliveryDate)))[0];
  return best && Math.abs(daysBetween(best.startDate, deliveryDate)) <= 60 ? best : null;
}

export async function savePurchaseOrders(db: Db, admin: AuthUser, raw: unknown, now = new Date()): Promise<PurchaseOrdersResult> {
  requirePermission(admin, "referentiel.manage");
  const parsed = purchaseOrdersPayloadSchema.safeParse(raw);
  if (!parsed.success) throw new PurchaseOrderError("Données de bons de commande inattendues : déposez à nouveau les fichiers");
  // Du plus ancien au plus récent : le dernier prix d'achat est celui du dernier bon livré.
  const orders = [...parsed.data].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.number.localeCompare(b.number));
  const result: PurchaseOrdersResult = { orders: 0, replaced: 0, lines: 0, createdMaterials: 0, newPrices: 0, newSuppliers: 0, outsideCalendar: 0 };

  await db.transaction(async (tx) => {
    for (const order of orders) {
      // ─── Fournisseur ───────────────────────────────────────────────────
      const supplierKey = tomeKey(order.supplier);
      let [supplier] = await tx.select().from(s.suppliers).where(eq(s.suppliers.key, supplierKey));
      if (!supplier) {
        [supplier] = await tx.insert(s.suppliers).values({ name: order.supplier, key: supplierKey }).returning();
        result.newSuppliers++;
      }

      // ─── Bon : nouveau, ou redéposé (lignes et prix remplacés) ───────────
      const week = await weekOf(tx, order.week, order.deliveryDate);
      if (!week) result.outsideCalendar++;
      const values = {
        supplierId: supplier!.id,
        supplierLabel: order.supplierLabel,
        subject: order.subject,
        weekNumber: order.week,
        productionWeekId: week?.id ?? null,
        deliveryDate: order.deliveryDate,
        orderedOn: order.orderedOn,
        totalEur: order.totalEur,
        fileName: order.fileName,
        warnings: order.warnings,
        importedBy: admin.id,
        importedAt: now,
      };
      const [existing] = await tx.select().from(s.purchaseOrders).where(eq(s.purchaseOrders.number, order.number));
      let orderId: string;
      let previousPrices: (typeof s.productPrices.$inferSelect)[] = [];
      if (existing) {
        previousPrices = await tx.delete(s.productPrices).where(eq(s.productPrices.purchaseOrderId, existing.id)).returning();
        await tx.delete(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.orderId, existing.id));
        await tx.update(s.purchaseOrders).set({ ...values, version: existing.version + 1 }).where(eq(s.purchaseOrders.id, existing.id));
        orderId = existing.id;
        result.replaced++;
      } else {
        const [created] = await tx.insert(s.purchaseOrders).values({ number: order.number, ...values }).returning({ id: s.purchaseOrders.id });
        orderId = created!.id;
      }
      result.orders++;

      for (const line of order.lines) {
        // ─── Catégorie Melba ───────────────────────────────────────────────
        let categoryId: string | null = null;
        if (line.category) {
          const key = tomeKey(line.category);
          const [found] = await tx.select().from(s.materialCategories).where(eq(s.materialCategories.key, key));
          categoryId = found?.id ?? (await tx.insert(s.materialCategories).values({ name: line.category, key }).returning())[0]!.id;
        }

        // ─── Matière : celle du tome de même libellé, sinon créée ─────────────
        const key = tomeKey(line.designation);
        const externalId = melbaExternalId(key);
        let [product] = await tx.select().from(s.products).where(eq(s.products.externalId, externalId));
        if (!product) {
          // Produit saisi à la main avant, de même nom : rattaché plutôt que doublé.
          const manual = (await tx.select().from(s.products).where(and(isNull(s.products.externalId), inArray(s.products.category, ["matiere_premiere", "produit_externe"])))).find(
            (p) => tomeKey(`${p.name} ${p.variant ?? ""}`) === key,
          );
          if (manual) [product] = await tx.update(s.products).set({ externalId, updatedAt: now }).where(eq(s.products.id, manual.id)).returning();
        }
        if (!product) {
          [product] = await tx
            .insert(s.products)
            .values({
              // Une préparation d'encas achetée est aussi un ingrédient du tome : matière première.
              category: isMouldLabel(line.designation) ? "moule_plat_gratin" : "matiere_premiere",
              externalId,
              name: line.designation,
              defaultUnit: "kg",
              source: "bon_commande",
              materialCategoryId: categoryId,
            })
            .returning();
          result.createdMaterials++;
        } else if (!product.materialCategoryId && categoryId) {
          await tx.update(s.products).set({ materialCategoryId: categoryId, updatedAt: now }).where(eq(s.products.id, product.id));
        }

        // Liquide : densité de référence si la matière n'en a pas, pour ramener un prix au litre au kg.
        if (product!.densityKgPerL == null && (await applyReferenceDensities(tx, [product!.id]))) {
          [product] = await tx.select().from(s.products).where(eq(s.products.id, product!.id));
        }
        const price = purchaseLinePrice(line, product!.densityKgPerL);
        await tx.insert(s.purchaseOrderLines).values({
          orderId,
          position: line.position,
          designation: line.designation,
          key,
          productId: product!.id,
          supplierCode: line.supplierCode,
          materialCategoryId: categoryId,
          quantity: line.quantity,
          packagingLabel: line.packaging?.label ?? null,
          contentQuantity: line.packaging?.contentQuantity ?? null,
          contentUnit: line.packaging?.contentUnit ?? null,
          unitPriceEur: line.unitPriceEur,
          priceUnit: line.priceUnit,
          totalEur: line.totalEur,
          perKgEur: price.perKgEur,
          perUnitEur: price.perUnitEur,
        });
        result.lines++;

        // ─── Colis fournisseur : le plus récent ──────────────────────────────
        const packaging = {
          supplierCode: line.supplierCode,
          packagingLabel: line.packaging?.label ?? null,
          contentQuantity: line.packaging?.contentQuantity ?? null,
          contentUnit: line.packaging?.contentUnit ?? null,
          lastOrderId: orderId,
          lastDeliveryDate: order.deliveryDate,
          updatedAt: now,
        };
        await tx
          .insert(s.supplierProducts)
          .values({ productId: product!.id, supplierId: supplier!.id, ...packaging })
          .onConflictDoUpdate({
            target: [s.supplierProducts.productId, s.supplierProducts.supplierId],
            set: packaging,
            setWhere: sql`${s.supplierProducts.lastDeliveryDate} <= ${order.deliveryDate}`,
          });

        // ─── Prix d'achat daté du jour de livraison ───────────────────────────
        if (price.perKgEur == null && price.perUnitEur == null) continue;
        const version = { unit: line.priceUnit, unitWeightG: null, perKgEur: price.perKgEur, perUnitEur: price.perUnitEur };
        const purchases = await tx
          .select()
          .from(s.productPrices)
          .where(and(eq(s.productPrices.productId, product!.id), inArray(s.productPrices.source, ["bon_commande", "manuel"])));
        const sameDay = purchases.find((v) => v.source === "bon_commande" && v.validFrom === order.deliveryDate);
        if (sameDay) {
          // Deux bons livrés le même jour : le dernier lu fait foi.
          if (!samePrice(sameDay, version)) {
            await tx.update(s.productPrices).set({ ...version, purchaseOrderId: orderId, createdBy: admin.id, createdAt: now }).where(eq(s.productPrices.id, sameDay.id));
            result.newPrices++;
          }
          continue;
        }
        const before = priceInForce(purchases.filter((v) => v.validFrom < order.deliveryDate), order.deliveryDate);
        if (before && before.source === "bon_commande" && samePrice(before, version)) continue;
        await tx.insert(s.productPrices).values({ productId: product!.id, source: "bon_commande", validFrom: order.deliveryDate, ...version, purchaseOrderId: orderId, createdBy: admin.id, createdAt: now });
        // Bon redéposé : seul un prix qui a changé compte comme nouveau.
        const previous = previousPrices.find((v) => v.productId === product!.id && v.validFrom === order.deliveryDate);
        if (!previous || !samePrice(previous, version)) result.newPrices++;
      }
    }
    await writeAudit(tx, {
      userId: admin.id,
      action: "import_purchase_orders",
      entity: "purchase_order",
      after: { ...result, numbers: orders.map((o) => o.number) },
      occurredAt: now,
    });
  });
  return result;
}

/** Bons de commande enregistrés : les plus récents, et le total par fournisseur (écran d'import). */
export async function purchaseOrdersOverview(db: Db, admin: AuthUser, limit = 15) {
  requirePermission(admin, "referentiel.manage");
  const [recent, bySupplier, [materials]] = await Promise.all([
    db
      .select({
        id: s.purchaseOrders.id,
        number: s.purchaseOrders.number,
        supplier: s.suppliers.name,
        subject: s.purchaseOrders.subject,
        weekNumber: s.purchaseOrders.weekNumber,
        deliveryDate: s.purchaseOrders.deliveryDate,
        totalEur: s.purchaseOrders.totalEur,
        version: s.purchaseOrders.version,
        warnings: s.purchaseOrders.warnings,
        importedAt: s.purchaseOrders.importedAt,
        lines: sql<number>`(select count(*)::int from ${s.purchaseOrderLines} where ${s.purchaseOrderLines.orderId} = ${s.purchaseOrders.id})`,
      })
      .from(s.purchaseOrders)
      .innerJoin(s.suppliers, eq(s.purchaseOrders.supplierId, s.suppliers.id))
      .orderBy(desc(s.purchaseOrders.importedAt), desc(s.purchaseOrders.deliveryDate))
      .limit(limit),
    db
      .select({
        supplier: s.suppliers.name,
        orders: sql<number>`count(*)::int`,
        from: sql<string>`min(${s.purchaseOrders.deliveryDate})::text`,
        to: sql<string>`max(${s.purchaseOrders.deliveryDate})::text`,
      })
      .from(s.purchaseOrders)
      .innerJoin(s.suppliers, eq(s.purchaseOrders.supplierId, s.suppliers.id))
      .groupBy(s.suppliers.name)
      .orderBy(s.suppliers.name),
    db.select({ n: sql<number>`count(distinct ${s.purchaseOrderLines.productId})::int` }).from(s.purchaseOrderLines),
  ]);
  return { recent, bySupplier, orderedMaterials: materials?.n ?? 0 };
}

/** Numéros déjà enregistrés parmi ceux donnés (aperçu : « déjà déposé, sera remplacé »). */
export async function knownPurchaseOrderNumbers(db: Db, numbers: string[]) {
  if (!numbers.length) return [];
  const rows = await db.select({ number: s.purchaseOrders.number }).from(s.purchaseOrders).where(inArray(s.purchaseOrders.number, numbers));
  return rows.map((r) => r.number);
}

