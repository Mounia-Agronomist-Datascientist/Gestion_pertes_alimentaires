/**
 * Comparaison des semaines (docs/PHASE4.md, étape 4.5 ; cahier des charges §19.6) :
 * - semaine choisie, semaine précédente, moyenne des 4 semaines d'avant, même semaine l'année précédente ;
 * - série des dernières semaines avec le volume prévu, pour comparer **à volume égal** (kg pour 1 000 barquettes
 *   prévues) : une semaine de 70 000 barquettes ne se compare pas en kg seuls à une semaine de 30 000 ;
 * - évolution mensuelle (12 derniers mois) et annuelle (années de production).
 */
import { and, asc, desc, eq, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { monthBounds } from "@/domain/periodes";
import { type LossFact, type StatsSummary, summarize } from "@/domain/statistiques";
import { movingAverage, TREND_STABLE_RATE, type Trend, trendOf } from "@/domain/tendances";
import { loadAlertSettings } from "@/modules/alertes/reglages";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { loadFacts, type StatsFilters } from "./facts";
import { actualVolumes, type PlannedVolume, plannedVolumes } from "./production";
import { volumeTeam } from "./ratios";

/** Kg perdus pour 1 000 barquettes prévues ; null sans volume prévu. */
export function kgPerThousand(foodKg: number, planned: PlannedVolume | null | undefined): number | null {
  if (!planned?.barquettes) return null;
  return Math.round((foodKg / planned.barquettes) * 1000 * 100) / 100;
}

export interface WeekPoint {
  id: string;
  year: number;
  number: number;
  summary: StatsSummary;
  planned: PlannedVolume | null;
  perThousand: number | null;
  /** Volume réellement produit (« Décompte barquettes »), s'il est déposé. */
  actual: PlannedVolume | null;
  perThousandActual: number | null;
}

/** Moyenne de valeurs connues ; null s'il n'y en a aucune. */
function average(values: readonly (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  return known.length ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100) / 100 : null;
}

async function weekPoints(
  db: Db,
  user: AuthUser,
  weeks: readonly { id: string; year: number; number: number; startDate: string; endDate: string }[],
  filters: StatsFilters,
) {
  if (!weeks.length) return [];
  const withCosts = can(user, "indicators.read");
  const sorted = [...weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const team = volumeTeam(user, filters);
  const [facts, planned, actual] = await Promise.all([
    loadFacts(db, user, { kind: "periode", from: sorted[0]!.startDate, to: sorted.at(-1)!.endDate }, filters),
    plannedVolumes(
      db,
      weeks.map((w) => w.id),
      team,
    ),
    actualVolumes(
      db,
      weeks.map((w) => w.id),
      team,
    ),
  ]);
  const byWeek = new Map<string, LossFact[]>();
  for (const f of facts)
    (byWeek.get(f.productionWeekId) ?? byWeek.set(f.productionWeekId, []).get(f.productionWeekId)!).push(f);
  return weeks.map((w): WeekPoint => {
    const summary = summarize(byWeek.get(w.id) ?? [], withCosts);
    const volume = planned.get(w.id) ?? null;
    const real = actual.get(w.id) ?? null;
    return {
      id: w.id,
      year: w.year,
      number: w.number,
      summary,
      planned: volume,
      perThousand: kgPerThousand(summary.foodKg, volume),
      actual: real,
      perThousandActual: kgPerThousand(summary.foodKg, real),
    };
  });
}

const WEEK_COLUMNS = {
  id: s.productionWeeks.id,
  year: s.productionWeeks.year,
  number: s.productionWeeks.number,
  startDate: s.productionWeeks.startDate,
  endDate: s.productionWeeks.endDate,
};

/** Les `count` semaines du calendrier jusqu'à la semaine donnée comprise, de la plus ancienne à la plus récente ; null si elle n'existe pas. */
export async function recentWeeks(db: Db, anchor: { year: number; number: number }, count: number) {
  const [week] = await db
    .select(WEEK_COLUMNS)
    .from(s.productionWeeks)
    .where(and(eq(s.productionWeeks.year, anchor.year), eq(s.productionWeeks.number, anchor.number)));
  if (!week) return null;
  return (
    await db
      .select(WEEK_COLUMNS)
      .from(s.productionWeeks)
      .where(lte(s.productionWeeks.startDate, week.startDate))
      .orderBy(desc(s.productionWeeks.startDate))
      .limit(count)
  ).reverse();
}

export interface TrendIndicator {
  key: "kg" | "volume" | "reel" | "net";
  label: string;
  unit: "kg" | "eur";
  /** Valeur de chaque semaine de la série et sa moyenne glissante sur 4 semaines. */
  values: (number | null)[];
  average: (number | null)[];
  trend: Trend;
}

/**
 * Tendances des indicateurs principaux sur la série des semaines (docs/PHASE6.md, étape 6.1) : kg, kg pour
 * 1 000 barquettes prévues et produites, coût net pour les profils qui voient les euros. Sans aucune perte sur la
 * série, rien n'est calculé.
 */
export function weekTrends(
  series: readonly WeekPoint[],
  withCosts: boolean,
  stableRate = TREND_STABLE_RATE,
): TrendIndicator[] {
  // Les semaines d'avant la première perte enregistrée de la série ne comptent pas : l'outil n'était pas encore
  // utilisé, elles feraient croire à une hausse (même règle que l'évolution mensuelle).
  const first = series.findIndex((p) => p.summary.events > 0);
  const indicator = (
    key: TrendIndicator["key"],
    label: string,
    unit: TrendIndicator["unit"],
    all: (number | null)[],
  ): TrendIndicator => {
    const values = all.map((v, i) => (first >= 0 && i >= first ? v : null));
    return { key, label, unit, values, average: movingAverage(values), trend: trendOf(values, stableRate) };
  };
  return [
    indicator(
      "kg",
      "Kg de pertes alimentaires",
      "kg",
      series.map((p) => p.summary.foodKg),
    ),
    indicator(
      "volume",
      "Kg pour 1 000 barquettes prévues",
      "kg",
      series.map((p) => p.perThousand),
    ),
    indicator(
      "reel",
      "Kg pour 1 000 barquettes produites",
      "kg",
      series.map((p) => p.perThousandActual),
    ),
    ...(withCosts
      ? [
          indicator(
            "net",
            "Coût net",
            "eur",
            series.map((p) => p.summary.cost?.netEur ?? null),
          ),
        ]
      : []),
  ];
}

export async function weekComparison(
  db: Db,
  user: AuthUser,
  anchor: { year: number; number: number },
  filters: StatsFilters,
  count = 12,
) {
  const recent = await recentWeeks(db, anchor, count);
  if (!recent) return null;
  const [lastYear] = await db
    .select(WEEK_COLUMNS)
    .from(s.productionWeeks)
    .where(and(eq(s.productionWeeks.year, anchor.year - 1), eq(s.productionWeeks.number, anchor.number)));
  const [points, settings] = await Promise.all([weekPoints(db, user, recent, filters), loadAlertSettings(db)]);
  const [lastYearPoint] = lastYear ? await weekPoints(db, user, [lastYear], filters) : [];
  const current = points.at(-1)!;
  const before = points.slice(0, -1);
  const lastFour = before.slice(-4);
  return {
    withCosts: can(user, "indicators.read"),
    current,
    previous: before.at(-1) ?? null,
    /** Moyenne des 4 semaines précédentes (semaines sans perte comprises). */
    average: lastFour.length
      ? {
          weeks: lastFour.length,
          foodKg: average(lastFour.map((p) => p.summary.foodKg)),
          barquettes: average(lastFour.map((p) => p.summary.barquettes)),
          events: average(lastFour.map((p) => p.summary.events)),
          grossEur: average(lastFour.map((p) => p.summary.cost?.grossEur ?? null)),
          perThousand: average(lastFour.map((p) => p.perThousand)),
          perThousandActual: average(lastFour.map((p) => p.perThousandActual)),
        }
      : null,
    /** Même semaine l'année précédente, seulement si des pertes y sont enregistrées. */
    lastYear: lastYearPoint && lastYearPoint.summary.events > 0 ? lastYearPoint : null,
    series: points,
    trends: weekTrends(points, can(user, "indicators.read"), settings.trendStableRate),
    /** Écart sous lequel la tendance est dite stable (réglage de l'administration). */
    trendStableRate: settings.trendStableRate,
    volumeTeam: volumeTeam(user, filters),
  };
}

/** Pertes des 12 mois jusqu'au mois donné (date réelle de la perte). */
export async function monthlyEvolution(
  db: Db,
  user: AuthUser,
  anchor: { year: number; month: number },
  filters: StatsFilters,
  count = 12,
) {
  const months = Array.from({ length: count }, (_, i) => {
    const index = anchor.year * 12 + anchor.month - 1 - (count - 1 - i);
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
  const from = monthBounds(months[0]!.year, months[0]!.month).from;
  const to = monthBounds(anchor.year, anchor.month).to;
  const withCosts = can(user, "indicators.read");
  // Une période libre est limitée à un an : 12 mois tiennent dans 366 jours au plus.
  const facts = await loadFacts(db, user, { kind: "periode", from, to }, filters);
  return months.map((m) => {
    const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
    return {
      ...m,
      summary: summarize(
        facts.filter((f) => f.occurredOn.startsWith(key)),
        withCosts,
      ),
    };
  });
}

/** Totaux par année de production, jusqu'à l'année donnée (années du calendrier ayant des pertes). */
export async function annualEvolution(db: Db, user: AuthUser, upToYear: number, filters: StatsFilters) {
  const years = (
    await db
      .selectDistinct({ year: s.productionWeeks.year })
      .from(s.productionWeeks)
      .where(lte(s.productionWeeks.year, upToYear))
      .orderBy(asc(s.productionWeeks.year))
  ).map((y) => y.year);
  const withCosts = can(user, "indicators.read");
  const rows = await Promise.all(
    years.map(async (year) => ({
      year,
      summary: summarize(await loadFacts(db, user, { kind: "annee", year }, filters), withCosts),
    })),
  );
  return rows.filter((r) => r.summary.events > 0);
}
