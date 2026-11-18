/**
 * Recoupement de la semaine (docs/PHASE6.md, étape 6.9) : ingrédients du tome en vigueur face aux bons de commande
 * de la même semaine de production. Lecture seule.
 */
import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type LastOrder, type OrderedLine, reconcileWeek, type TomeUseLine } from "@/domain/recoupement";
import { formatProductionWeek } from "@/domain/semaine-production";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";

export class ReconciliationError extends Error {}

/** Semaines qui ont un tome en vigueur ou au moins un bon de commande, de la plus récente à la plus ancienne. */
export async function reconciliationWeeks(db: Db, user: AuthUser) {
  requirePermission(user, "referentiel.manage");
  const [weeks, tomes, orders] = await Promise.all([
    db
      .select({
        id: s.productionWeeks.id,
        year: s.productionWeeks.year,
        number: s.productionWeeks.number,
        startDate: s.productionWeeks.startDate,
      })
      .from(s.productionWeeks)
      .orderBy(desc(s.productionWeeks.startDate)),
    db
      .select({ weekId: s.weeklyImports.productionWeekId })
      .from(s.weeklyImports)
      .where(eq(s.weeklyImports.status, "validee")),
    db
      .select({ weekId: s.purchaseOrders.productionWeekId, n: sql<number>`count(*)::int` })
      .from(s.purchaseOrders)
      .groupBy(s.purchaseOrders.productionWeekId),
  ]);
  const withTome = new Set(tomes.map((t) => t.weekId));
  const ordersOf = new Map(orders.map((o) => [o.weekId, o.n]));
  return weeks
    .map((w) => ({ ...w, hasTome: withTome.has(w.id), orders: ordersOf.get(w.id) ?? 0 }))
    .filter((w) => w.hasTome || w.orders > 0);
}

export async function weekReconciliation(db: Db, user: AuthUser, weekId: string) {
  requirePermission(user, "referentiel.manage");
  const [week] = await db.select().from(s.productionWeeks).where(eq(s.productionWeeks.id, weekId));
  if (!week) throw new ReconciliationError("Semaine inconnue.");
  const [tome] = await db
    .select({ id: s.weeklyImports.id })
    .from(s.weeklyImports)
    .where(and(eq(s.weeklyImports.productionWeekId, week.id), eq(s.weeklyImports.status, "validee")));

  const tomeLines: TomeUseLine[] = tome
    ? (
        await db
          .select({
            label: s.weekRecipeLines.label,
            key: s.weekRecipeLines.key,
            quantity: s.weekRecipeLines.quantity,
            unit: s.weekRecipeLines.unit,
            unitWeightG: s.weekRecipeLines.unitWeightG,
            costEur: s.weekRecipeLines.costEur,
            recipeCode: s.weekRecipes.code,
            recipeName: s.weekRecipes.name,
            subRecipeName: s.weekSubRecipes.name,
          })
          .from(s.weekRecipeLines)
          .leftJoin(s.weekRecipes, eq(s.weekRecipeLines.recipeId, s.weekRecipes.id))
          .leftJoin(s.weekSubRecipes, eq(s.weekRecipeLines.subRecipeId, s.weekSubRecipes.id))
          .where(and(eq(s.weekRecipeLines.importId, tome.id), eq(s.weekRecipeLines.isSubRecipe, false)))
      ).map(({ recipeCode, recipeName, subRecipeName, ...l }) => ({
        ...l,
        usedIn: recipeCode ? `${recipeCode} ${recipeName}` : `Sous-recette : ${subRecipeName}`,
      }))
    : [];

  const orderLines: OrderedLine[] = await db
    .select({
      key: s.purchaseOrderLines.key,
      designation: s.purchaseOrderLines.designation,
      supplier: s.suppliers.name,
      orderNumber: s.purchaseOrders.number,
      deliveryDate: s.purchaseOrders.deliveryDate,
      quantity: s.purchaseOrderLines.quantity,
      packagingLabel: s.purchaseOrderLines.packagingLabel,
      totalEur: s.purchaseOrderLines.totalEur,
      perKgEur: s.purchaseOrderLines.perKgEur,
      perUnitEur: s.purchaseOrderLines.perUnitEur,
    })
    .from(s.purchaseOrderLines)
    .innerJoin(s.purchaseOrders, eq(s.purchaseOrderLines.orderId, s.purchaseOrders.id))
    .innerJoin(s.suppliers, eq(s.purchaseOrders.supplierId, s.suppliers.id))
    .where(eq(s.purchaseOrders.productionWeekId, week.id))
    .orderBy(s.purchaseOrders.deliveryDate, s.purchaseOrderLines.position);

  // Dernière commande d'un ingrédient avant la semaine (il peut venir du stock).
  const tomeKeys = [...new Set(tomeLines.map((l) => l.key).filter(Boolean))];
  const lastOrders: LastOrder[] = tomeKeys.length
    ? await db
        .selectDistinctOn([s.purchaseOrderLines.key], {
          key: s.purchaseOrderLines.key,
          supplier: s.suppliers.name,
          deliveryDate: s.purchaseOrders.deliveryDate,
        })
        .from(s.purchaseOrderLines)
        .innerJoin(s.purchaseOrders, eq(s.purchaseOrderLines.orderId, s.purchaseOrders.id))
        .innerJoin(s.suppliers, eq(s.purchaseOrders.supplierId, s.suppliers.id))
        .where(and(inArray(s.purchaseOrderLines.key, tomeKeys), lt(s.purchaseOrders.deliveryDate, week.startDate)))
        .orderBy(s.purchaseOrderLines.key, desc(s.purchaseOrders.deliveryDate))
    : [];

  // Une commande absente du tome de la semaine est peut-être pour un autre tome.
  const strayKeys = [...new Set(orderLines.map((l) => l.key))].filter((k) => !tomeKeys.includes(k));
  const otherTomeKeys = new Map<string, string[]>();
  if (strayKeys.length) {
    const rows = await db
      .selectDistinct({
        key: s.weekRecipeLines.key,
        year: s.productionWeeks.year,
        number: s.productionWeeks.number,
        startDate: s.productionWeeks.startDate,
      })
      .from(s.weekRecipeLines)
      .innerJoin(s.weeklyImports, eq(s.weekRecipeLines.importId, s.weeklyImports.id))
      .innerJoin(s.productionWeeks, eq(s.weeklyImports.productionWeekId, s.productionWeeks.id))
      .where(
        and(
          inArray(s.weekRecipeLines.key, strayKeys),
          eq(s.weeklyImports.status, "validee"),
          ne(s.productionWeeks.id, week.id),
        ),
      )
      .orderBy(s.productionWeeks.startDate);
    for (const r of rows) otherTomeKeys.set(r.key, [...(otherTomeKeys.get(r.key) ?? []), formatProductionWeek(r)]);
  }

  return {
    week: { id: week.id, label: formatProductionWeek(week), startDate: week.startDate, endDate: week.endDate },
    hasTome: !!tome,
    orders: new Set(orderLines.map((l) => l.orderNumber)).size,
    ...reconcileWeek({ tomeLines, orderLines, lastOrders, otherTomeKeys }),
  };
}

export type WeekReconciliationView = Awaited<ReturnType<typeof weekReconciliation>>;
