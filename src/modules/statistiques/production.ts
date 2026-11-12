/**
 * Volume de production **prévu** d'une semaine (docs/PHASE4.md, décision du 10/11/2026) : barquettes du plan de
 * production de l'import validé de la semaine, et kg = barquettes × poids d'une portion du tome Melba.
 *
 * Sert à comparer les semaines à volume égal (§19.6) et aux ratios (§19.7). Sans import validé, la semaine n'a
 * pas de volume : rien n'est estimé. Les barquettes réellement produites (« Décompte barquettes ») viendront
 * s'ajouter à côté (étape 4.6).
 */
import { and, eq, inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { roundQuantity } from "@/domain/nombres";

export interface PlannedVolume {
  barquettes: number;
  /** Kg prévus ; null si aucun plat n'a de poids de portion. */
  kg: number | null;
  /** Plats du plan sans poids de portion connu (kg incomplets). */
  dishesWithoutWeight: number;
}

/** Barquettes et kg prévus par semaine (clé : id de la semaine), éventuellement pour une seule équipe. */
export async function plannedVolumes(db: Db, weekIds: readonly string[], teamId?: string | null): Promise<Map<string, PlannedVolume>> {
  if (!weekIds.length) return new Map();
  const rows = await db
    .select({
      weekId: s.weeklyImports.productionWeekId,
      barquettes: s.weekRecipes.weekBarquettes,
      portionWeightG: s.weekRecipes.portionWeightG,
      totalWeightG: s.weekRecipes.totalWeightG,
    })
    .from(s.weekRecipes)
    .innerJoin(s.weeklyImports, eq(s.weeklyImports.id, s.weekRecipes.importId))
    .where(
      and(
        inArray(s.weeklyImports.productionWeekId, [...weekIds]),
        eq(s.weeklyImports.status, "validee"),
        teamId ? eq(s.weekRecipes.teamId, teamId) : undefined,
      ),
    );
  const volumes = new Map<string, { barquettes: number; kg: number; weighed: number; dishesWithoutWeight: number }>();
  for (const r of rows) {
    if (!r.barquettes) continue;
    const v = volumes.get(r.weekId) ?? volumes.set(r.weekId, { barquettes: 0, kg: 0, weighed: 0, dishesWithoutWeight: 0 }).get(r.weekId)!;
    v.barquettes += r.barquettes;
    const grams = r.portionWeightG ?? r.totalWeightG;
    if (grams) {
      v.kg += (r.barquettes * grams) / 1000;
      v.weighed++;
    } else {
      v.dishesWithoutWeight++;
    }
  }
  return new Map(
    [...volumes].map(([weekId, v]) => [weekId, { barquettes: v.barquettes, kg: v.weighed ? roundQuantity(v.kg) : null, dishesWithoutWeight: v.dishesWithoutWeight }]),
  );
}
