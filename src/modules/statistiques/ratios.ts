/**
 * Ratios de pertes (docs/PHASE4.md, étape 4.6 ; cahier des charges §19.7). Trois ratios distincts, chacun avec
 * son dénominateur affiché, sur le volume **prévu** et sur le volume **réel** côte à côte :
 * - barquettes perdues (pertes saisies en barquettes) / barquettes produites ;
 * - kg de pertes alimentaires / kg produits (barquettes × poids d'une portion) — jamais d'unités d'emballage ;
 * - coût matières des pertes / coût matières de la production (barquettes × coût Melba d'une portion), pour les
 *   profils qui voient les euros.
 * Un ratio sans dénominateur n'est pas calculé. Sur plusieurs semaines, seules les semaines qui ont le
 * dénominateur comptent (numérateur et dénominateur sur les mêmes semaines).
 */
import { and, asc, desc, eq, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { roundQuantity } from "@/domain/nombres";
import { type LossFact, type StatsSummary, summarize } from "@/domain/statistiques";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { loadFacts, type StatsFilters } from "./facts";
import { actualVolumes, type PlannedVolume, plannedVolumes } from "./production";

export type VolumeSource = "prevu" | "reel";

export interface RatioValues {
  /** Semaines comptées (celles qui ont le dénominateur). */
  weeks: number;
  lostBarquettes: number;
  producedBarquettes: number;
  barquetteRate: number | null;
  foodKg: number;
  producedKg: number | null;
  kgRate: number | null;
  materialLossEur: number | null;
  productionCostEur: number | null;
  costRate: number | null;
  /** Codes produits sans poids ou sans coût Melba (dénominateur incomplet). */
  incomplete: { weight: number; cost: number };
}

const rate = (num: number, den: number | null | undefined) => (den ? Math.round((num / den) * 10_000) / 10_000 : null);

/** Ratios d'un ensemble de semaines (pertes par semaine + volumes) ; null si aucune semaine n'a de volume. */
export function ratiosOf(points: readonly { summary: StatsSummary; volume: PlannedVolume | null }[], withCosts: boolean): RatioValues | null {
  const counted = points.filter((p) => p.volume && p.volume.barquettes > 0);
  if (!counted.length) return null;
  const sum = (f: (p: (typeof counted)[number]) => number) => counted.reduce((a, p) => a + f(p), 0);
  const lostBarquettes = roundQuantity(sum((p) => p.summary.barquettes));
  const producedBarquettes = sum((p) => p.volume!.barquettes);
  const foodKg = roundQuantity(sum((p) => p.summary.foodKg));
  const withKg = counted.filter((p) => p.volume!.kg != null);
  const producedKg = withKg.length === counted.length ? roundQuantity(sum((p) => p.volume!.kg!)) : null;
  const withCost = counted.filter((p) => p.volume!.costEur != null);
  const productionCostEur = withCosts && withCost.length === counted.length ? Math.round(sum((p) => p.volume!.costEur!) * 100) / 100 : null;
  const materialLossEur = withCosts ? Math.round(sum((p) => p.summary.cost?.materialEur ?? 0) * 100) / 100 : null;
  return {
    weeks: counted.length,
    lostBarquettes,
    producedBarquettes,
    barquetteRate: rate(lostBarquettes, producedBarquettes),
    foodKg,
    producedKg,
    kgRate: rate(foodKg, producedKg),
    materialLossEur,
    productionCostEur,
    costRate: materialLossEur != null ? rate(materialLossEur, productionCostEur) : null,
    incomplete: { weight: sum((p) => p.volume!.dishesWithoutWeight), cost: sum((p) => p.volume!.dishesWithoutCost) },
  };
}

const WEEK = { id: s.productionWeeks.id, year: s.productionWeeks.year, number: s.productionWeeks.number, startDate: s.productionWeeks.startDate, endDate: s.productionWeeks.endDate };

/** Équipe du volume : celle du filtre, ou celle du compte s'il ne voit que son équipe. */
export function volumeTeam(user: AuthUser, filters: StatsFilters): string | null {
  if (filters.teamId) return filters.teamId;
  return can(user, "stats.compare_teams") ? null : user.teamId;
}

/**
 * Ratios de la semaine choisie, des `count` dernières semaines et de l'année de production jusqu'à cette
 * semaine, sur le prévu et le réel.
 */
export async function weekRatios(db: Db, user: AuthUser, anchor: { year: number; number: number }, filters: StatsFilters, count = 12) {
  const [week] = await db.select(WEEK).from(s.productionWeeks).where(and(eq(s.productionWeeks.year, anchor.year), eq(s.productionWeeks.number, anchor.number)));
  if (!week) return null;
  const yearWeeks = await db
    .select(WEEK)
    .from(s.productionWeeks)
    .where(and(eq(s.productionWeeks.year, anchor.year), lte(s.productionWeeks.startDate, week.startDate)))
    .orderBy(asc(s.productionWeeks.startDate));
  const recent = (await db.select(WEEK).from(s.productionWeeks).where(lte(s.productionWeeks.startDate, week.startDate)).orderBy(desc(s.productionWeeks.startDate)).limit(count)).reverse();
  const all = [...new Map([...yearWeeks, ...recent].map((w) => [w.id, w])).values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const withCosts = can(user, "indicators.read");
  const team = volumeTeam(user, filters);
  const [facts, planned, actual] = await Promise.all([
    loadFacts(db, user, { kind: "periode", from: all[0]!.startDate, to: all.at(-1)!.endDate }, filters),
    plannedVolumes(db, all.map((w) => w.id), team),
    actualVolumes(db, all.map((w) => w.id), team),
  ]);
  const byWeek = new Map<string, LossFact[]>();
  for (const f of facts) (byWeek.get(f.productionWeekId) ?? byWeek.set(f.productionWeekId, []).get(f.productionWeekId)!).push(f);
  const point = (w: (typeof all)[number]) => {
    const summary = summarize(byWeek.get(w.id) ?? [], withCosts);
    return { week: w, summary, planned: planned.get(w.id) ?? null, actual: actual.get(w.id) ?? null };
  };
  const points = new Map(all.map((w) => [w.id, point(w)]));
  const both = (list: readonly (typeof all)[number][]) => {
    const ps = list.map((w) => points.get(w.id)!);
    return {
      prevu: ratiosOf(ps.map((p) => ({ summary: p.summary, volume: p.planned })), withCosts),
      reel: ratiosOf(ps.map((p) => ({ summary: p.summary, volume: p.actual })), withCosts),
    };
  };
  return {
    withCosts,
    team,
    week: both([week]),
    year: { year: anchor.year, weeks: yearWeeks.length, ...both(yearWeeks) },
    series: recent.map((w) => ({ id: w.id, year: w.year, number: w.number, ...both([w]) })),
  };
}
