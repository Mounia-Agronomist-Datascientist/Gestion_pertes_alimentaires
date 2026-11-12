/**
 * Analyses par zone et par équipe (docs/PHASE4.md, étape 4.3 ; cahier des charges §19.2, §19.3).
 *
 * - Comparaison : une ligne par zone ou par équipe de la période, avec l'évolution par rapport à la période
 *   précédente. La comparaison des équipes est réservée aux profils `stats.compare_teams` (§19.3).
 * - Détail d'une zone ou d'une équipe : causes principales, produits, sous-zones, équipes (pour une zone),
 *   devenir des pertes, et kg des dernières semaines de production.
 */
import { and, desc, eq, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { productLabel } from "@/domain/produits";
import { monthBounds, type Period } from "@/domain/periodes";
import { type LossFact, rankGroups, type StatsSummary, summarize } from "@/domain/statistiques";
import { type AuthUser, can, ForbiddenError } from "@/modules/auth/permissions";
import { adjacentOf, loadFacts, type StatsFilters } from "./facts";

export type Axis = "zone" | "equipe";

const keyOf = (axis: Axis) => (f: LossFact) => (axis === "zone" ? f.zoneId : f.teamId);

async function labels(db: Db) {
  const [zones, subzones, teams] = await Promise.all([
    db.select({ id: s.zones.id, name: s.zones.name, order: s.zones.displayOrder }).from(s.zones),
    db.select({ id: s.subzones.id, name: s.subzones.name, zoneId: s.subzones.zoneId }).from(s.subzones),
    db.select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName, order: s.teams.displayOrder }).from(s.teams),
  ]);
  return {
    zone: new Map(zones.map((z) => [z.id, { label: z.name, order: z.order }])),
    subzone: new Map(subzones.map((z) => [z.id, z.name])),
    team: new Map(teams.map((t) => [t.id, { label: `Équipe ${t.letter} – ${t.colorName}`, order: t.order }])),
  };
}

function checkAxis(user: AuthUser, axis: Axis) {
  if (axis === "equipe" && !can(user, "stats.compare_teams")) throw new ForbiddenError("Comparaison des équipes réservée aux responsables");
}

export interface AxisRow {
  id: string;
  label: string;
  summary: StatsSummary;
  previous: StatsSummary | null;
}

/** Une ligne par zone ou par équipe ayant des pertes, dans l'ordre d'affichage du référentiel. */
export async function compareAxis(db: Db, user: AuthUser, axis: Axis, period: Period, filters: StatsFilters) {
  checkAxis(user, axis);
  const withCosts = can(user, "indicators.read");
  const [facts, previousPeriod, names] = await Promise.all([loadFacts(db, user, period, filters), adjacentOf(db, period, -1), labels(db)]);
  const previousFacts = previousPeriod ? await loadFacts(db, user, previousPeriod, filters) : null;
  const previous = previousFacts ? new Map(rankGroups(previousFacts, keyOf(axis), withCosts).map((g) => [g.key, g.summary])) : null;
  const ref = axis === "zone" ? names.zone : names.team;
  const rows: AxisRow[] = rankGroups(facts, keyOf(axis), withCosts)
    .map((g) => ({ id: g.key, label: ref.get(g.key)?.label ?? "—", summary: g.summary, previous: previous ? (previous.get(g.key) ?? summarize([], withCosts)) : null }))
    .sort((a, b) => (ref.get(a.id)?.order ?? 0) - (ref.get(b.id)?.order ?? 0));
  // Pertes sans équipe (responsable de zone) : signalées à part dans la comparaison des équipes.
  const withoutTeam = axis === "equipe" ? facts.filter((f) => !f.teamId).length : 0;
  return { withCosts, rows, previousPeriod, withoutTeam };
}

/** Dernier jour d'une période (pour les semaines récentes affichées dans le détail). */
async function periodEnd(db: Db, period: Period): Promise<string | null> {
  switch (period.kind) {
    case "semaine": {
      const [w] = await db
        .select({ endDate: s.productionWeeks.endDate })
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, period.year), eq(s.productionWeeks.number, period.number)));
      return w?.endDate ?? null;
    }
    case "annee": {
      const [w] = await db
        .select({ endDate: s.productionWeeks.endDate })
        .from(s.productionWeeks)
        .where(eq(s.productionWeeks.year, period.year))
        .orderBy(desc(s.productionWeeks.startDate))
        .limit(1);
      return w?.endDate ?? null;
    }
    case "mois":
      return monthBounds(period.year, period.month).to;
    case "periode":
      return period.to;
  }
}

/** Kg alimentaires et nombre de pertes des `count` dernières semaines de production jusqu'à la fin de la période. */
export async function recentWeeks(db: Db, user: AuthUser, period: Period, filters: StatsFilters, count = 8) {
  const end = await periodEnd(db, period);
  if (!end) return [];
  const weeks = (
    await db
      .select({ id: s.productionWeeks.id, year: s.productionWeeks.year, number: s.productionWeeks.number, startDate: s.productionWeeks.startDate, endDate: s.productionWeeks.endDate })
      .from(s.productionWeeks)
      .where(lte(s.productionWeeks.startDate, end))
      .orderBy(desc(s.productionWeeks.startDate))
      .limit(count)
  ).reverse();
  if (!weeks.length) return [];
  const facts = await loadFacts(db, user, { kind: "periode", from: weeks[0]!.startDate, to: weeks.at(-1)!.endDate }, filters);
  const withCosts = can(user, "indicators.read");
  return weeks.map((w) => ({ year: w.year, number: w.number, summary: summarize(facts.filter((f) => f.productionWeekId === w.id), withCosts) }));
}

/** Détail d'une zone ou d'une équipe sur la période (§19.2, §19.3). */
export async function axisDetail(db: Db, user: AuthUser, axis: Axis, id: string, period: Period, filters: StatsFilters) {
  // Une équipe consulte le détail de sa propre équipe ; les autres équipes restent réservées aux responsables.
  if (axis === "equipe" && !(can(user, "stats.compare_teams") || user.teamId === id)) throw new ForbiddenError();
  const withCosts = can(user, "indicators.read");
  const scoped: StatsFilters = { ...filters, ...(axis === "zone" ? { zoneId: id } : { teamId: id }) };
  const [facts, names, weeks] = await Promise.all([loadFacts(db, user, period, scoped), labels(db), recentWeeks(db, user, period, scoped)]);
  const ranked = (keyFn: (f: LossFact) => string | null) => rankGroups(facts, keyFn, withCosts);
  const firstName = new Map<string, LossFact>();
  for (const f of facts) {
    if (!firstName.has(f.causeId)) firstName.set(f.causeId, f);
    if (!firstName.has(f.productKey)) firstName.set(f.productKey, f);
  }
  return {
    withCosts,
    label: (axis === "zone" ? names.zone : names.team).get(id)?.label ?? null,
    summary: summarize(facts, withCosts),
    causes: ranked((f) => f.causeId).map((g) => ({ ...g, label: firstName.get(g.key)!.causeName })),
    products: ranked((f) => f.productKey).map((g) => ({ ...g, label: productLabel(firstName.get(g.key)!.productName, firstName.get(g.key)!.productCode), category: firstName.get(g.key)!.category })),
    subzones: ranked((f) => f.subzoneId).map((g) => ({ ...g, label: names.subzone.get(g.key) ?? "—" })),
    teams:
      axis === "zone" && can(user, "stats.compare_teams")
        ? ranked((f) => f.teamId).map((g) => ({ ...g, label: names.team.get(g.key)?.label ?? "—" }))
        : [],
    weeks,
  };
}
