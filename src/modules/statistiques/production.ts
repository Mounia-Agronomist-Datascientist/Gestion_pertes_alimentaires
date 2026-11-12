/**
 * Volume de production d'une semaine (docs/PHASE4.md, règle R15), dénominateur des comparaisons à volume égal
 * (§19.6) et des ratios (§19.7) :
 * - **prévu** : barquettes du plan de production de l'import en vigueur ;
 * - **réel** : colonne « Ma production » du « Décompte barquettes » en vigueur.
 * Kg = barquettes × poids d'une portion du tome Melba ; coût matières = barquettes × coût Melba d'une portion.
 * Sans import ou sans décompte, la semaine n'a pas de volume : rien n'est estimé.
 */
import { and, eq, inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { roundQuantity } from "@/domain/nombres";

export interface PlannedVolume {
  barquettes: number;
  /** Kg produits ; null si aucun plat n'a de poids de portion. */
  kg: number | null;
  /** Codes sans poids de portion connu (kg incomplets). */
  dishesWithoutWeight: number;
  /** Coût matières Melba de la production ; null si aucun plat n'a de coût. */
  costEur: number | null;
  /** Codes sans coût Melba (coût incomplet). */
  dishesWithoutCost: number;
}

interface Recipe {
  teamId: string | null;
  portionWeightG: number | null;
  totalWeightG: number | null;
  totalCostEur: number | null;
}

/** Additionne des lignes (semaine, barquettes, plat) en volumes par semaine. */
function accumulate(lines: Iterable<{ weekId: string; barquettes: number; recipe: Recipe | undefined }>): Map<string, PlannedVolume> {
  const acc = new Map<string, { barquettes: number; kg: number; weighed: number; noWeight: number; cost: number; costed: number; noCost: number }>();
  for (const l of lines) {
    if (!l.barquettes) continue;
    const v = acc.get(l.weekId) ?? acc.set(l.weekId, { barquettes: 0, kg: 0, weighed: 0, noWeight: 0, cost: 0, costed: 0, noCost: 0 }).get(l.weekId)!;
    v.barquettes += l.barquettes;
    const grams = l.recipe?.portionWeightG ?? l.recipe?.totalWeightG;
    if (grams) {
      v.kg += (l.barquettes * grams) / 1000;
      v.weighed++;
    } else {
      v.noWeight++;
    }
    if (l.recipe?.totalCostEur != null) {
      v.cost += l.barquettes * l.recipe.totalCostEur;
      v.costed++;
    } else {
      v.noCost++;
    }
  }
  return new Map(
    [...acc].map(([weekId, v]) => [
      weekId,
      {
        barquettes: v.barquettes,
        kg: v.weighed ? roundQuantity(v.kg) : null,
        dishesWithoutWeight: v.noWeight,
        costEur: v.costed ? Math.round(v.cost * 100) / 100 : null,
        dishesWithoutCost: v.noCost,
      },
    ]),
  );
}

/** Plats des imports en vigueur des semaines, par « semaine:code ». */
async function weekRecipes(db: Db, weekIds: readonly string[]) {
  const rows = await db
    .select({
      weekId: s.weeklyImports.productionWeekId,
      code: s.weekRecipes.code,
      barquettes: s.weekRecipes.weekBarquettes,
      teamId: s.weekRecipes.teamId,
      portionWeightG: s.weekRecipes.portionWeightG,
      totalWeightG: s.weekRecipes.totalWeightG,
      totalCostEur: s.weekRecipes.totalCostEur,
    })
    .from(s.weekRecipes)
    .innerJoin(s.weeklyImports, eq(s.weeklyImports.id, s.weekRecipes.importId))
    .where(and(inArray(s.weeklyImports.productionWeekId, [...weekIds]), eq(s.weeklyImports.status, "validee")));
  return rows;
}

/** Volume prévu par semaine (clé : id de la semaine), éventuellement pour une seule équipe. */
export async function plannedVolumes(db: Db, weekIds: readonly string[], teamId?: string | null): Promise<Map<string, PlannedVolume>> {
  if (!weekIds.length) return new Map();
  const rows = (await weekRecipes(db, weekIds)).filter((r) => !teamId || r.teamId === teamId);
  return accumulate(rows.map((r) => ({ weekId: r.weekId, barquettes: r.barquettes ?? 0, recipe: r })));
}

/**
 * Volume réellement produit par semaine (« Décompte barquettes » en vigueur). L'équipe, le poids et le coût
 * d'une portion de chaque code viennent de l'import de la même semaine ; un code absent de l'import compte dans
 * le total toutes équipes, mais ni dans une équipe, ni dans les kg, ni dans le coût (signalé).
 */
export async function actualVolumes(db: Db, weekIds: readonly string[], teamId?: string | null): Promise<Map<string, PlannedVolume>> {
  if (!weekIds.length) return new Map();
  const [lines, recipes] = await Promise.all([
    db
      .select({ weekId: s.productionCounts.productionWeekId, code: s.productionCountLines.code, made: s.productionCountLines.madeBarquettes })
      .from(s.productionCountLines)
      .innerJoin(s.productionCounts, eq(s.productionCounts.id, s.productionCountLines.countId))
      .where(and(inArray(s.productionCounts.productionWeekId, [...weekIds]), eq(s.productionCounts.status, "validee"))),
    weekRecipes(db, weekIds),
  ]);
  const recipeOf = new Map(recipes.map((r) => [`${r.weekId}:${r.code}`, r]));
  return accumulate(
    lines
      .map((l) => ({ weekId: l.weekId, barquettes: l.made, recipe: recipeOf.get(`${l.weekId}:${l.code}`) }))
      .filter((l) => !teamId || l.recipe?.teamId === teamId),
  );
}
