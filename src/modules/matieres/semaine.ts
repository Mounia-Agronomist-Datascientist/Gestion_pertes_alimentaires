/**
 * Matières de la semaine proposées en premier en Réception et en Stockage (docs/PHASE6.md, étape 6.10) : les
 * ingrédients du tome en vigueur et les matières commandées dans les bons de la même semaine de production, une
 * fois chacune. Le reste du référentiel reste accessible par la recherche.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { melbaExternalId } from "@/domain/matieres";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";

export interface WeekMaterial {
  productId: string;
  name: string;
  /** Catégorie Melba (bons de commande), qui donne le lieu de stockage. */
  categoryId: string | null;
  /** Lieu de stockage propre au produit (à la place de celui de sa catégorie), ou null. */
  storageSubzoneId: string | null;
  /** Commandée dans un bon de la semaine. */
  ordered: boolean;
  /** Ingrédient du tome de la semaine. */
  inTome: boolean;
}

export interface WeekMaterials {
  weekId: string;
  /** Par rapport à la semaine en cours : -1 (S-1), 0, 1 (S+1). */
  relative: -1 | 0 | 1;
  year: number;
  number: number;
  materials: WeekMaterial[];
}

/** Matières d'une semaine de production (produits actifs seulement), par ordre alphabétique. */
export async function materialsOfWeek(db: Db, weekId: string): Promise<WeekMaterial[]> {
  const [tome] = await db
    .select({ id: s.weeklyImports.id })
    .from(s.weeklyImports)
    .where(and(eq(s.weeklyImports.productionWeekId, weekId), eq(s.weeklyImports.status, "validee")));
  const [tomeKeys, ordered] = await Promise.all([
    tome
      ? db
          .selectDistinct({ key: s.weekRecipeLines.key })
          .from(s.weekRecipeLines)
          .where(and(eq(s.weekRecipeLines.importId, tome.id), eq(s.weekRecipeLines.isSubRecipe, false)))
      : Promise.resolve([]),
    db
      .selectDistinct({ productId: s.purchaseOrderLines.productId })
      .from(s.purchaseOrderLines)
      .innerJoin(s.purchaseOrders, eq(s.purchaseOrderLines.orderId, s.purchaseOrders.id))
      .where(eq(s.purchaseOrders.productionWeekId, weekId)),
  ]);
  const externalIds = tomeKeys.map((k) => melbaExternalId(k.key)).filter((id) => id !== melbaExternalId(""));
  const orderedIds = new Set(ordered.map((o) => o.productId));
  const columns = {
    id: s.products.id,
    name: s.products.name,
    categoryId: s.products.materialCategoryId,
    storageSubzoneId: s.products.storageSubzoneId,
    externalId: s.products.externalId,
  };
  const [fromTome, fromOrders] = await Promise.all([
    externalIds.length
      ? db
          .select(columns)
          .from(s.products)
          .where(and(inArray(s.products.externalId, externalIds), eq(s.products.active, true)))
      : Promise.resolve([]),
    orderedIds.size
      ? db
          .select(columns)
          .from(s.products)
          .where(and(inArray(s.products.id, [...orderedIds]), eq(s.products.active, true)))
      : Promise.resolve([]),
  ]);
  const inTome = new Set(fromTome.map((p) => p.id));
  const byId = new Map([...fromTome, ...fromOrders].map((p) => [p.id, p]));
  return [...byId.values()]
    .map((p) => ({
      productId: p.id,
      name: p.name,
      categoryId: p.categoryId,
      storageSubzoneId: p.storageSubzoneId,
      ordered: orderedIds.has(p.id),
      inTome: inTome.has(p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Matières de la semaine précédente, de la semaine en cours et de la suivante, dans l'ordre (S-1, S, S+1). La semaine
 * suivante sert à la Réception : ses bons arrivent dès le jeudi de la semaine en cours (décision du 19/11/2026).
 */
export async function recentWeekMaterials(db: Db, today: LocalDate): Promise<WeekMaterials[]> {
  const thisWeek = await findStoredProductionWeek(db, today);
  if (!thisWeek) return [];
  const [previous, next] = await Promise.all([
    findStoredProductionWeek(db, addDays(thisWeek.startDate, -1)),
    findStoredProductionWeek(db, addDays(thisWeek.endDate, 1)),
  ]);
  const weeks = [
    { week: previous, relative: -1 as const },
    { week: thisWeek, relative: 0 as const },
    { week: next, relative: 1 as const },
  ].filter((w) => w.week != null);
  return Promise.all(
    weeks.map(async ({ week, relative }) => ({
      weekId: week!.id,
      relative,
      year: week!.year,
      number: week!.number,
      materials: await materialsOfWeek(db, week!.id),
    })),
  );
}

/** Catégories Melba et leur lieu de stockage (sous-zone de Stockage), pour filtrer la liste par sous-zone. */
export async function materialCategoriesWithStorage(db: Db) {
  return db
    .select({
      id: s.materialCategories.id,
      name: s.materialCategories.name,
      storageSubzoneId: s.materialCategories.storageSubzoneId,
    })
    .from(s.materialCategories)
    .orderBy(asc(s.materialCategories.name));
}

export class StorageSettingError extends Error {}

/**
 * Réglage « catégorie Melba → sous-zone de Stockage » (décision du 17/11/2026), fait une fois ; null = pas de lieu.
 * Seules les sous-zones de la zone Stockage sont acceptées. Retourne le nombre de catégories changées.
 */
export async function setCategoriesStorage(db: Db, admin: AuthUser, raw: unknown): Promise<number> {
  requirePermission(admin, "referentiel.manage");
  const parsed = z
    .array(z.object({ categoryId: z.uuid(), subzoneId: z.uuid().nullable() }))
    .max(500)
    .safeParse(raw);
  if (!parsed.success) throw new StorageSettingError("Réglage illisible.");
  const storage = await db
    .select({ id: s.subzones.id })
    .from(s.subzones)
    .innerJoin(s.zones, eq(s.subzones.zoneId, s.zones.id))
    .where(eq(s.zones.code, "STOCKAGE"));
  const allowed = new Set(storage.map((x) => x.id));
  if (parsed.data.some((a) => a.subzoneId && !allowed.has(a.subzoneId)))
    throw new StorageSettingError("Lieu de stockage inconnu.");
  return db.transaction(async (tx) => {
    const current = new Map((await tx.select().from(s.materialCategories)).map((c) => [c.id, c]));
    const changes: { category: string; before: string | null; after: string | null }[] = [];
    for (const a of parsed.data) {
      const c = current.get(a.categoryId);
      if (!c) throw new StorageSettingError("Catégorie inconnue.");
      if (c.storageSubzoneId === a.subzoneId) continue;
      await tx
        .update(s.materialCategories)
        .set({ storageSubzoneId: a.subzoneId, updatedAt: new Date() })
        .where(eq(s.materialCategories.id, c.id));
      changes.push({ category: c.name, before: c.storageSubzoneId, after: a.subzoneId });
    }
    if (changes.length)
      await writeAudit(tx, {
        userId: admin.id,
        action: "set_category_storage",
        entity: "material_category",
        after: { changes },
      });
    return changes.length;
  });
}

/** Sous-zones de Stockage, dans l'ordre d'affichage (choix du lieu d'une catégorie). */
export async function storageSubzones(db: Db) {
  return db
    .select({ id: s.subzones.id, name: s.subzones.name })
    .from(s.subzones)
    .innerJoin(s.zones, eq(s.subzones.zoneId, s.zones.id))
    .where(and(eq(s.zones.code, "STOCKAGE"), eq(s.subzones.active, true)))
    .orderBy(asc(s.subzones.displayOrder));
}

/** Catégories Melba avec leur nombre de matières (écran de réglage). */
export async function categoriesForSetting(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const [categories, counts] = await Promise.all([
    materialCategoriesWithStorage(db),
    db
      .select({ categoryId: s.products.materialCategoryId, n: sql<number>`count(*)::int` })
      .from(s.products)
      .where(and(eq(s.products.category, "matiere_premiere"), eq(s.products.active, true)))
      .groupBy(s.products.materialCategoryId),
  ]);
  const countOf = new Map(counts.map((c) => [c.categoryId, c.n]));
  return {
    categories: categories.map((c) => ({ ...c, materials: countOf.get(c.id) ?? 0 })),
    uncategorized: countOf.get(null) ?? 0,
  };
}
