/**
 * Enregistrement d'une semaine importée (plan de production + tome Melba), docs/PHASE2.md étape 2.3.
 * Une semaine validée est figée ; un nouvel import de la même semaine crée la version suivante et l'ancienne
 * passe en « remplacée ». Rien n'est effacé.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import type { WeekImportPreview } from "./merge";
import type { TomeLine } from "./tome/parse-tome";

export class ImportError extends Error {}

export interface SaveWeekImportInput {
  preview: WeekImportPreview;
  tomeFileName: string;
  planFileName: string;
  planSheetName: string;
}

const weightInGrams = (q: { quantity: number; unit: string } | null) =>
  q && /^g$/i.test(q.unit.trim()) ? q.quantity : q && /^kg$/i.test(q.unit.trim()) ? q.quantity * 1000 : null;

export async function saveWeekImport(db: Db, admin: AuthUser, input: SaveWeekImportInput, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const { preview } = input;
  if (preview.errors.length) throw new ImportError(preview.errors[0]!);
  if (preview.year == null || preview.week == null) throw new ImportError("Semaine du tome inconnue");

  const [week] = await db
    .select()
    .from(s.productionWeeks)
    .where(and(eq(s.productionWeeks.year, preview.year), eq(s.productionWeeks.number, preview.week)));
  if (!week) throw new ImportError(`La semaine S${preview.week}-${preview.year} n'est pas dans le calendrier`);
  const teamRows = await db.select({ id: s.teams.id, letter: s.teams.letter }).from(s.teams);
  const teamId = new Map(teamRows.map((t) => [t.letter, t.id]));

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(s.weeklyImports)
      .where(eq(s.weeklyImports.productionWeekId, week.id))
      .orderBy(desc(s.weeklyImports.version))
      .limit(1);
    if (previous?.status === "validee") {
      await tx.update(s.weeklyImports).set({ status: "remplacee", replacedAt: now }).where(eq(s.weeklyImports.id, previous.id));
    }
    const [created] = await tx
      .insert(s.weeklyImports)
      .values({
        productionWeekId: week.id,
        version: (previous?.version ?? 0) + 1,
        tomeFileName: input.tomeFileName,
        planFileName: input.planFileName,
        planSheetName: input.planSheetName,
        anomalies: preview.warnings,
        createdBy: admin.id,
        createdAt: now,
      })
      .returning();
    const importId = created!.id;

    const subRecipeRows = preview.subRecipes.length
      ? await tx
          .insert(s.weekSubRecipes)
          .values(
            preview.subRecipes.map((sr) => ({
              importId,
              key: sr.key,
              name: sr.name,
              referenceQuantity: sr.reference?.quantity ?? null,
              referenceUnit: sr.reference?.unit ?? null,
              grossQuantity: sr.total?.quantity ?? null,
              grossUnit: sr.total?.unit ?? null,
              netQuantity: sr.net?.quantity ?? null,
              netUnit: sr.net?.unit ?? null,
              totalCostEur: sr.total?.cost ?? null,
            })),
          )
          .returning({ id: s.weekSubRecipes.id, key: s.weekSubRecipes.key })
      : [];
    const subRecipeId = new Map(subRecipeRows.map((r) => [r.key, r.id]));

    const recipeRows = await tx
      .insert(s.weekRecipes)
      .values(
        preview.recipes.map((r) => ({
          importId,
          code: r.code,
          name: r.name,
          teamId: r.team ? (teamId.get(r.team) ?? null) : null,
          planGroup: r.planGroup,
          planBlock: r.planBlock,
          weekBarquettes: r.weekBarquettes,
          firstDayBarquettes: r.firstDayBarquettes,
          portionWeightG: r.portionWeightG,
          totalWeightG: weightInGrams(r.total),
          totalCostEur: r.total?.cost ?? null,
        })),
      )
      .returning({ id: s.weekRecipes.id, code: s.weekRecipes.code });
    const recipeId = new Map(recipeRows.map((r) => [r.code, r.id]));

    const lineValues = (lines: TomeLine[], owner: { recipeId?: string; subRecipeId?: string }) =>
      lines.map((l, position) => ({
        importId,
        recipeId: owner.recipeId ?? null,
        subRecipeId: owner.subRecipeId ?? null,
        position,
        label: l.label,
        key: l.key,
        isSubRecipe: l.isSubRecipe,
        componentSubRecipeId: l.isSubRecipe ? (subRecipeId.get(l.key) ?? null) : null,
        quantity: l.quantity,
        unit: l.unit,
        unitWeightG: l.unitWeightG,
        costEur: l.cost,
      }));
    const lines = [
      ...preview.recipes.flatMap((r) => lineValues(r.lines, { recipeId: recipeId.get(r.code)! })),
      ...preview.subRecipes.flatMap((sr) => lineValues(sr.lines, { subRecipeId: subRecipeId.get(sr.key)! })),
    ];
    // Insertion par paquets : une semaine compte environ 700 lignes.
    for (let i = 0; i < lines.length; i += 500) await tx.insert(s.weekRecipeLines).values(lines.slice(i, i + 500));

    await writeAudit(tx, {
      userId: admin.id,
      action: "import_week",
      entity: "weekly_import",
      entityId: importId,
      after: {
        week: `S${preview.week}-${preview.year}`,
        version: created!.version,
        recipes: preview.recipes.length,
        subRecipes: preview.subRecipes.length,
        lines: lines.length,
        files: [input.tomeFileName, `${input.planFileName} (onglet ${input.planSheetName})`],
      },
      reason: previous ? `Remplace la version ${previous.version}` : null,
      occurredAt: now,
    });
    return created!;
  });
}

/** Import en vigueur d'une semaine de production, ou null. */
export async function currentWeekImport(db: Db, productionWeekId: string) {
  const [row] = await db
    .select()
    .from(s.weeklyImports)
    .where(and(eq(s.weeklyImports.productionWeekId, productionWeekId), eq(s.weeklyImports.status, "validee")));
  return row ?? null;
}

/** Plats d'une équipe pour une semaine (import en vigueur), par code. */
export async function teamWeekRecipes(db: Db, productionWeekId: string, teamId: string) {
  const current = await currentWeekImport(db, productionWeekId);
  if (!current) return [];
  return db
    .select()
    .from(s.weekRecipes)
    .where(and(eq(s.weekRecipes.importId, current.id), eq(s.weekRecipes.teamId, teamId)))
    .orderBy(asc(s.weekRecipes.code));
}
