/**
 * Synthèse hebdomadaire des pertes (docs/PHASE4.md, étape 4.7 ; demande du 12/11/2026) : montant, zones, causes
 * et produits de la semaine, comparés à la semaine précédente et à la moyenne des 4 semaines d'avant, pour voir
 * directement où s'améliorer. Classement en euros pour les profils qui les voient (si la semaine a des pertes
 * chiffrées), sinon en kg.
 */
import { asc } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { productLabel } from "@/domain/produits";
import { type LossFact, type RankBy, rankGroups, type StatsSummary, summarize } from "@/domain/statistiques";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { weekComparison } from "./evolution";
import { adjacentOf, loadFacts, type StatsFilters } from "./facts";

export interface WeeklyRow {
  key: string;
  label: string;
  summary: StatsSummary;
  /** Valeur classée (euros ou kg) et sa part de la semaine. */
  value: number;
  share: number;
  /** Valeur de la semaine précédente (0 si absente). */
  previous: number;
  delta: number;
}

const valueOf = (by: RankBy) => (s: StatsSummary | undefined) => (s ? (by === "cout" ? (s.cost?.grossEur ?? 0) : s.foodKg) : 0);

function compareGroups(current: readonly LossFact[], previous: readonly LossFact[], keyOf: (f: LossFact) => string | null, labelOf: (key: string, facts: LossFact[]) => string, by: RankBy, withCosts: boolean): WeeklyRow[] {
  const value = valueOf(by);
  const before = new Map(rankGroups(previous, keyOf, withCosts, by).map((g) => [g.key, g.summary]));
  const groups = rankGroups(current, keyOf, withCosts, by);
  const total = groups.reduce((a, g) => a + value(g.summary), 0);
  return groups.map((g) => {
    const v = value(g.summary);
    const p = value(before.get(g.key));
    return {
      key: g.key,
      label: labelOf(
        g.key,
        current.filter((f) => keyOf(f) === g.key),
      ),
      summary: g.summary,
      value: v,
      share: total > 0 ? v / total : 0,
      previous: p,
      delta: Math.round((v - p) * 100) / 100,
    };
  });
}

export async function weeklySummary(db: Db, user: AuthUser, anchor: { year: number; number: number }, filters: StatsFilters) {
  const withCosts = can(user, "indicators.read");
  const week = { kind: "semaine" as const, ...anchor };
  const [comparison, previousPeriod, zones] = await Promise.all([
    weekComparison(db, user, anchor, filters, 12),
    adjacentOf(db, week, -1),
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones).orderBy(asc(s.zones.displayOrder)),
  ]);
  if (!comparison) return null;
  const [current, previous] = await Promise.all([loadFacts(db, user, week, filters), previousPeriod ? loadFacts(db, user, previousPeriod, filters) : Promise.resolve([])]);
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const summary = summarize(current, withCosts);
  // En euros pour les profils qui les voient, sauf semaine sans aucune perte chiffrée : alors en kg.
  const by: RankBy = withCosts && (summary.cost?.grossEur ?? 0) > 0 ? "cout" : "kg";

  const byZone = compareGroups(current, previous, (f) => f.zoneId, (k) => zoneName.get(k) ?? "—", by, withCosts);
  const byCause = compareGroups(current, previous, (f) => f.causeId, (_, list) => list[0]!.causeName, by, withCosts);
  const byProduct = compareGroups(current, previous, (f) => f.productKey, (_, list) => productLabel(list[0]!.productName, list[0]!.productCode), by, withCosts);

  // Points d'attention : les plus fortes hausses par rapport à la semaine précédente (zones, causes, produits).
  const rises = [
    ...byZone.map((r) => ({ ...r, kind: "Zone" })),
    ...byCause.map((r) => ({ ...r, kind: "Cause" })),
    ...byProduct.map((r) => ({ ...r, kind: "Produit" })),
  ]
    // Sans perte la semaine précédente, tout serait « en hausse » : pas de points d'attention dans ce cas.
    .filter((r) => previous.length > 0 && r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  return {
    withCosts,
    by,
    summary,
    comparison,
    previousPeriod,
    byZone,
    byCause,
    byProduct,
    rises,
  };
}
