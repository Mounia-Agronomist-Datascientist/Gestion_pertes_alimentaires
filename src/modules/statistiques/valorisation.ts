/**
 * Onglet « Valorisation » (docs/PHASE5.md, étape 5.1) : ce que deviennent les pertes de la période (avec recette,
 * sans recette, à part) et le suivi des 12 dernières semaines. Mêmes droits et filtres que les autres onglets.
 */
import { asc } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { Period } from "@/domain/periodes";
import type { LossFact } from "@/domain/statistiques";
import { RECOVERY_GROUPS, type RecoveryTotals, recoverySummary } from "@/domain/valorisation";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { recentWeeks } from "./evolution";
import { loadFacts, type StatsFilters } from "./facts";

export interface RecoveryWeek {
  id: string;
  year: number;
  number: number;
  groups: Record<(typeof RECOVERY_GROUPS)[number]["key"], RecoveryTotals>;
}

export async function recoveryDashboard(db: Db, user: AuthUser, period: Period, anchor: { year: number; number: number } | null, filters: StatsFilters) {
  const withCosts = can(user, "indicators.read");
  const [facts, destinations, weeks] = await Promise.all([
    loadFacts(db, user, period, filters),
    db.select({ id: s.destinations.id, name: s.destinations.name }).from(s.destinations).orderBy(asc(s.destinations.displayOrder)),
    anchor ? recentWeeks(db, anchor, 12) : Promise.resolve(null),
  ]);
  const nameOf = new Map(destinations.map((d) => [d.id, d.name]));
  const summary = recoverySummary(facts, withCosts);

  let series: RecoveryWeek[] = [];
  if (weeks?.length) {
    const weekFacts = await loadFacts(db, user, { kind: "periode", from: weeks[0]!.startDate, to: weeks.at(-1)!.endDate }, filters);
    const byWeek = new Map<string, LossFact[]>();
    for (const f of weekFacts) (byWeek.get(f.productionWeekId) ?? byWeek.set(f.productionWeekId, []).get(f.productionWeekId)!).push(f);
    series = weeks.map((w) => ({ id: w.id, year: w.year, number: w.number, groups: recoverySummary(byWeek.get(w.id) ?? [], withCosts).groups }));
  }

  return {
    withCosts,
    events: facts.length,
    groups: summary.groups,
    destinations: summary.destinations.map((d) => ({ ...d, name: nameOf.get(d.destinationId) ?? "—" })),
    series,
  };
}
