/**
 * Enregistrement des ventes et dons des surplus de barquettes (docs/PHASE5.md, étape 5.8). Le fichier est lu dans
 * le navigateur ; seules les lignes de vente, de versement et de don sont envoyées et revérifiées ici.
 * - La semaine de production vient du calendrier stocké (null hors calendrier : la ligne reste comptée par date).
 * - Linkee : le plat est retrouvé par le code plat du n° de lot, dans l'import Melba en vigueur de sa semaine de
 *   production ; poids (barquettes × poids d'une portion) et coût matières (barquettes × coût d'une portion) sont
 *   figés au dépôt, comme le coût d'une perte.
 * - Un nouveau dépôt d'une source remplace les lignes en vigueur de cette source sur sa période ; elles restent en
 *   base, marquées par ce dépôt.
 */
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { ImportError } from "../service";
import { parseLot, SURPLUS_SOURCE_LABELS, type SurplusSource } from "./parse-surplus";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max).nullable();
const count = z.number().int().min(0).max(1_000_000);

export const surplusPayloadSchema = z
  .object({
    source: z.enum(["tgtg", "vente_flash", "linkee"]),
    fileName: z.string().min(1).max(200),
    sheets: z.array(z.string().min(1).max(60)).min(1).max(20),
    periodFrom: isoDate,
    periodTo: isoDate,
    entries: z
      .array(
        z.object({
          kind: z.enum(["vente", "versement", "don"]),
          date: isoDate,
          trays: count,
          breakfastTrays: count,
          offeredTrays: count.nullable(),
          boxes: count.nullable(),
          breakfastBoxes: count.nullable(),
          formula: text(60),
          amountEur: z.number().finite().min(-1_000_000).max(10_000_000).nullable(),
          code: text(40),
          note: text(400),
          dishName: text(200),
          lot: text(60),
          dishCode: text(10),
          producedOn: isoDate.nullable(),
          bestBefore: isoDate.nullable(),
          collected: z.boolean().nullable(),
        }),
      )
      .min(1)
      .max(20_000),
    warnings: z.array(z.string().max(400)).max(1000),
  })
  .refine((p) => p.periodFrom <= p.periodTo && p.entries.every((e) => p.periodFrom <= e.date && e.date <= p.periodTo), { message: "Période incohérente" })
  .refine((p) => p.entries.every((e) => (p.source === "linkee" ? e.kind === "don" : e.kind !== "don")), { message: "Lignes incohérentes avec la source" });
export type SurplusPayload = z.infer<typeof surplusPayloadSchema>;

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export async function saveSurplusImport(db: Db, admin: AuthUser, input: SurplusPayload, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const producedDates = input.entries.map((e) => e.producedOn).filter((d): d is string => d != null);
  const from = [input.periodFrom, ...producedDates].sort()[0]!;
  const weeks = await db
    .select({ id: s.productionWeeks.id, year: s.productionWeeks.year, number: s.productionWeeks.number, startDate: s.productionWeeks.startDate, endDate: s.productionWeeks.endDate })
    .from(s.productionWeeks)
    .where(and(lte(s.productionWeeks.startDate, input.periodTo), gte(s.productionWeeks.endDate, from)));
  const weekOf = (date: string) => weeks.find((w) => w.startDate <= date && date <= w.endDate);

  // Linkee : plat Melba de la semaine de production (date du lot, sinon n° de semaine du lot).
  const recipeOf = new Map<number, { id: string; netKg: number | null; costEur: number | null }>();
  let unmatched = 0;
  if (input.source === "linkee") {
    const productionWeekOf = (e: SurplusPayload["entries"][number]) => {
      if (e.producedOn) return weekOf(e.producedOn);
      const lotWeek = e.lot ? parseLot(e.lot).week : null;
      if (!lotWeek) return undefined;
      const collected = weekOf(e.date);
      // Un lot de fin d'année collecté en janvier appartient à l'année précédente.
      const year = collected && lotWeek > collected.number ? collected.year - 1 : (collected?.year ?? Number(e.date.slice(0, 4)));
      return weeks.find((w) => w.year === year && w.number === lotWeek);
    };
    const wanted = input.entries.map((e, i) => ({ i, code: e.dishCode, week: e.dishCode ? productionWeekOf(e) : undefined }));
    const weekIds = [...new Set(wanted.map((w) => w.week?.id).filter((id): id is string => id != null))];
    const recipes = weekIds.length
      ? await db
          .select({
            id: s.weekRecipes.id,
            code: s.weekRecipes.code,
            weekId: s.weeklyImports.productionWeekId,
            portionWeightG: s.weekRecipes.portionWeightG,
            totalWeightG: s.weekRecipes.totalWeightG,
            totalCostEur: s.weekRecipes.totalCostEur,
          })
          .from(s.weekRecipes)
          .innerJoin(s.weeklyImports, eq(s.weekRecipes.importId, s.weeklyImports.id))
          .where(and(eq(s.weeklyImports.status, "validee"), inArray(s.weeklyImports.productionWeekId, weekIds)))
      : [];
    for (const w of wanted) {
      if (!w.code) continue;
      const recipe = recipes.find((r) => r.weekId === w.week?.id && r.code === w.code);
      if (!recipe) {
        unmatched++;
        continue;
      }
      const trays = input.entries[w.i]!.trays;
      const grams = recipe.portionWeightG ?? recipe.totalWeightG;
      recipeOf.set(w.i, {
        id: recipe.id,
        netKg: grams ? round((trays * grams) / 1000, 3) : null,
        costEur: recipe.totalCostEur != null ? round(trays * recipe.totalCostEur, 2) : null,
      });
    }
  }
  const outside = input.entries.filter((e) => !weekOf(e.date)).length;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(s.surplusImports)
      .values({
        source: input.source,
        fileName: input.fileName,
        sheets: input.sheets.join(", "),
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        entries: input.entries.length,
        anomalies: input.warnings,
        createdBy: admin.id,
        createdAt: now,
      })
      .returning();
    const replaced = await tx
      .update(s.surplusEntries)
      .set({ replacedByImportId: created!.id })
      .where(
        and(
          eq(s.surplusEntries.source, input.source),
          isNull(s.surplusEntries.replacedByImportId),
          gte(s.surplusEntries.occurredOn, input.periodFrom),
          lte(s.surplusEntries.occurredOn, input.periodTo),
        ),
      )
      .returning({ id: s.surplusEntries.id });
    const rows = input.entries.map((e, i) => {
      const recipe = recipeOf.get(i);
      return {
        importId: created!.id,
        source: input.source,
        kind: e.kind,
        occurredOn: e.date,
        productionWeekId: weekOf(e.date)?.id ?? null,
        trays: e.trays,
        breakfastTrays: e.breakfastTrays,
        offeredTrays: e.offeredTrays,
        boxes: e.boxes,
        breakfastBoxes: e.breakfastBoxes,
        formula: e.formula,
        amountEur: e.amountEur,
        code: e.code,
        note: e.note,
        dishName: e.dishName,
        lot: e.lot,
        dishCode: e.dishCode,
        producedOn: e.producedOn,
        bestBefore: e.bestBefore,
        collected: e.collected,
        weekRecipeId: recipe?.id ?? null,
        netKg: recipe?.netKg ?? null,
        costEur: recipe?.costEur ?? null,
      };
    });
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(s.surplusEntries).values(rows.slice(i, i + 1000));
    await writeAudit(tx, {
      userId: admin.id,
      action: "import_surplus",
      entity: "surplus_import",
      entityId: created!.id,
      after: { source: input.source, period: `${input.periodFrom} → ${input.periodTo}`, entries: input.entries.length, file: input.fileName, sheets: input.sheets },
      reason: replaced.length ? `Remplace ${replaced.length} ligne${replaced.length > 1 ? "s" : ""} de la période` : null,
      occurredAt: now,
    });
    return { ...created!, replaced: replaced.length, matched: recipeOf.size, unmatched, outside };
  });
}

/** Dépôts enregistrés, du plus récent au plus ancien (écran d'import). */
export async function listSurplusImports(db: Db, admin: AuthUser, limit = 20) {
  requirePermission(admin, "referentiel.manage");
  return db
    .select({
      id: s.surplusImports.id,
      source: s.surplusImports.source,
      fileName: s.surplusImports.fileName,
      sheets: s.surplusImports.sheets,
      periodFrom: s.surplusImports.periodFrom,
      periodTo: s.surplusImports.periodTo,
      entries: s.surplusImports.entries,
      anomalies: s.surplusImports.anomalies,
      createdAt: s.surplusImports.createdAt,
      createdByName: s.users.displayName,
    })
    .from(s.surplusImports)
    .innerJoin(s.users, eq(s.surplusImports.createdBy, s.users.id))
    .orderBy(desc(s.surplusImports.createdAt))
    .limit(limit);
}

/** Période déjà couverte par source (lignes en vigueur), pour prévenir d'un remplacement dans l'aperçu. */
export async function surplusCoverage(db: Db, admin: AuthUser): Promise<Partial<Record<SurplusSource, { from: string; to: string; entries: number }>>> {
  requirePermission(admin, "referentiel.manage");
  const rows = await db
    .select({ source: s.surplusEntries.source, occurredOn: s.surplusEntries.occurredOn })
    .from(s.surplusEntries)
    .where(isNull(s.surplusEntries.replacedByImportId));
  const out: Partial<Record<SurplusSource, { from: string; to: string; entries: number }>> = {};
  for (const r of rows) {
    const c = (out[r.source] ??= { from: r.occurredOn, to: r.occurredOn, entries: 0 });
    c.entries++;
    if (r.occurredOn < c.from) c.from = r.occurredOn;
    if (r.occurredOn > c.to) c.to = r.occurredOn;
  }
  return out;
}

export { SURPLUS_SOURCE_LABELS };
