/**
 * Ventes et dons des surplus de barquettes dans l'onglet « Valorisation » (docs/PHASE5.md, étape 5.8) : chiffres
 * des fichiers de l'entreprise (Too Good To Go, ventes flash, Linkee) sur la période et les 12 dernières semaines.
 * Toute l'entreprise seulement (les fichiers ne se répartissent ni par zone ni par équipe) : réservé aux profils qui
 * comparent les équipes ; euros avec `indicators.read`. Les filtres de l'onglet ne s'y appliquent pas.
 */
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { monthBounds, type Period } from "@/domain/periodes";
import { type SurplusFact, type SurplusTotals, summarizeSurplus } from "@/domain/surplus";
import { type AuthUser, can, ForbiddenError } from "@/modules/auth/permissions";
import { recentWeeks } from "./evolution";

export function canReadSurplus(user: AuthUser): boolean {
  return can(user, "stats.compare_teams");
}

/** Dates d'une période : semaines du calendrier pour une semaine ou une année ; null hors calendrier. */
export async function periodDates(db: Db, period: Period): Promise<{ from: string; to: string } | null> {
  switch (period.kind) {
    case "semaine": {
      const [w] = await db
        .select({ from: s.productionWeeks.startDate, to: s.productionWeeks.endDate })
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, period.year), eq(s.productionWeeks.number, period.number)));
      return w ?? null;
    }
    case "annee": {
      const weeks = await db
        .select({ from: s.productionWeeks.startDate, to: s.productionWeeks.endDate })
        .from(s.productionWeeks)
        .where(eq(s.productionWeeks.year, period.year))
        .orderBy(asc(s.productionWeeks.startDate));
      return weeks.length ? { from: weeks[0]!.from, to: weeks.at(-1)!.to } : null;
    }
    case "mois":
      return monthBounds(period.year, period.month);
    case "periode":
      return { from: period.from, to: period.to };
  }
}

/** Lignes en vigueur entre deux dates. */
export async function loadSurplusFacts(db: Db, from: string, to: string): Promise<SurplusFact[]> {
  const e = s.surplusEntries;
  return db
    .select({
      source: e.source,
      kind: e.kind,
      occurredOn: e.occurredOn,
      trays: e.trays,
      breakfastTrays: e.breakfastTrays,
      offeredTrays: e.offeredTrays,
      boxes: e.boxes,
      breakfastBoxes: e.breakfastBoxes,
      amountEur: e.amountEur,
      netKg: e.netKg,
      costEur: e.costEur,
      collected: e.collected,
    })
    .from(e)
    .where(and(isNull(e.replacedByImportId), gte(e.occurredOn, from), lte(e.occurredOn, to)))
    .orderBy(asc(e.occurredOn));
}

export interface SurplusWeek {
  id: string;
  year: number;
  number: number;
  totals: SurplusTotals;
}

export async function surplusDashboard(db: Db, user: AuthUser, period: Period, anchor: { year: number; number: number } | null) {
  if (!canReadSurplus(user)) throw new ForbiddenError();
  const withCosts = can(user, "indicators.read");
  const [dates, weeks, anyFile] = await Promise.all([
    periodDates(db, period),
    anchor ? recentWeeks(db, anchor, 12) : Promise.resolve(null),
    db.select({ id: s.surplusImports.id }).from(s.surplusImports).limit(1),
  ]);
  const facts = dates ? await loadSurplusFacts(db, dates.from, dates.to) : [];
  let series: SurplusWeek[] = [];
  if (weeks?.length) {
    const weekFacts = await loadSurplusFacts(db, weeks[0]!.startDate, weeks.at(-1)!.endDate);
    series = weeks.map((w) => ({
      id: w.id,
      year: w.year,
      number: w.number,
      totals: summarizeSurplus(
        weekFacts.filter((f) => w.startDate <= f.occurredOn && f.occurredOn <= w.endDate),
        withCosts,
      ),
    }));
  }
  return { withCosts, hasFiles: anyFile.length > 0, dates, lines: facts.length, totals: summarizeSurplus(facts, withCosts), series };
}
