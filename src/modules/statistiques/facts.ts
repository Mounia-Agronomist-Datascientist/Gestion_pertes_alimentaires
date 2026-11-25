/**
 * Lecture des pertes pour les statistiques (docs/PHASE4.md, étape 4.1).
 *
 * Toujours filtrée par le périmètre du compte connecté, comme l'historique (docs/SECURITE.md §2), et toujours limitée
 * aux zones cochées du compte (décision du 19/11/2026) : une équipe ne lit que ses pertes, un responsable de zone ses
 * zones ; les profils qui comparent les équipes (production, direction, administration) voient toutes les équipes,
 * même sans accès à l'historique (direction). Les déclarations annulées et les brouillons sont exclus ;
 * une perte corrigée compte pour sa dernière version (destinations de cette version). Les euros ne sont transmis
 * qu'aux profils `indicators.read`.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte, or, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { splitSupplierReturns } from "@/domain/retours-fournisseur";
import type { Db } from "@/db/types";
import { adjacentPeriod, monthBounds, type Period } from "@/domain/periodes";
import { lossDays } from "@/domain/periode-perte";
import type { LossFact } from "@/domain/statistiques";
import { type AuthUser, can, ForbiddenError } from "@/modules/auth/permissions";
import { isNonFoodCategory } from "@/modules/declarations/input";
import { scopeCondition, zonesCondition } from "@/modules/declarations/queries";
import { tomeKey } from "@/modules/imports/tome/parse-tome";

export interface StatsFilters {
  zoneId?: string;
  subzoneId?: string;
  teamId?: string;
  category?: string;
  causeId?: string;
  destinationId?: string;
}

/** Droit de consulter les statistiques ; les euros demandent en plus `indicators.read`. */
export function canReadStats(user: AuthUser): boolean {
  return can(user, "stats.global") || can(user, "indicators.read");
}

/**
 * Condition SQL d'une période ; null si elle ne correspond à aucune semaine du calendrier. Semaine et année :
 * semaine de production ; mois et dates libres : date réelle de la perte. Utilisée aussi par « Coûts des pertes ».
 */
export async function periodCondition(db: Db, period: Period): Promise<SQL | null> {
  switch (period.kind) {
    case "semaine": {
      const [week] = await db
        .select({ id: s.productionWeeks.id })
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, period.year), eq(s.productionWeeks.number, period.number)));
      return week ? eq(s.lossDeclarations.productionWeekId, week.id) : null;
    }
    case "annee": {
      const weeks = await db
        .select({ id: s.productionWeeks.id })
        .from(s.productionWeeks)
        .where(eq(s.productionWeeks.year, period.year));
      return weeks.length
        ? inArray(
            s.lossDeclarations.productionWeekId,
            weeks.map((w) => w.id),
          )
        : null;
    }
    case "mois": {
      const { from, to } = monthBounds(period.year, period.month);
      return and(gte(s.lossDeclarations.occurredOn, from), lte(s.lossDeclarations.occurredOn, to))!;
    }
    case "periode":
      return and(gte(s.lossDeclarations.occurredOn, period.from), lte(s.lossDeclarations.occurredOn, period.to))!;
  }
}

/** Période voisine (−1 précédente, +1 suivante), avec la semaine voisine tirée du calendrier stocké. */
/** Dates de début et de fin d'une période (semaine, année : leurs semaines de production). */
export async function periodRange(db: Db, period: Period): Promise<{ from: string; to: string } | null> {
  switch (period.kind) {
    case "semaine": {
      const [week] = await db
        .select({ from: s.productionWeeks.startDate, to: s.productionWeeks.endDate })
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, period.year), eq(s.productionWeeks.number, period.number)));
      return week ?? null;
    }
    case "annee": {
      const weeks = await db
        .select({ from: s.productionWeeks.startDate, to: s.productionWeeks.endDate })
        .from(s.productionWeeks)
        .where(eq(s.productionWeeks.year, period.year));
      if (!weeks.length) return null;
      return {
        from: weeks.reduce((m, w) => (w.from < m ? w.from : m), weeks[0]!.from),
        to: weeks.reduce((m, w) => (w.to > m ? w.to : m), weeks[0]!.to),
      };
    }
    case "mois":
      return monthBounds(period.year, period.month);
    case "periode":
      return { from: period.from, to: period.to };
  }
}

/**
 * Pertes d'une période, y compris celles de plusieurs jours (décision du 26/11/2026) dont au moins un jour tombe dans
 * la période : à répartir ensuite avec `spreadOverDays`.
 */
export async function lossesInPeriodCondition(db: Db, period: Period): Promise<SQL | null> {
  const inPeriod = await periodCondition(db, period);
  const range = await periodRange(db, period);
  if (!inPeriod || !range) return inPeriod;
  const d = s.lossDeclarations;
  return or(inPeriod, and(isNotNull(d.periodStart), lte(d.periodStart, range.to), gte(d.occurredOn, range.from)))!;
}

/**
 * Perte de plusieurs jours : une part par jour de la période, à parts égales (kg, euros, quantités), datée de ce jour
 * et rangée dans sa semaine de production ; seuls les jours de la période demandée sont gardés. Une perte d'un seul
 * jour reste entière (part 1).
 */
export async function spreadOverDays<
  R extends { occurredOn: string; periodStart: string | null; productionWeekId: string },
>(
  db: Db,
  rows: readonly R[],
  period: Period,
  inPeriod: (row: R) => boolean = () => true,
): Promise<(R & { share: number })[]> {
  const spanning = rows.filter((r) => r.periodStart);
  if (!spanning.length) return rows.map((r) => ({ ...r, share: 1 }));
  const range = await periodRange(db, period);
  const first = spanning.reduce((m, r) => (r.periodStart! < m ? r.periodStart! : m), spanning[0]!.periodStart!);
  const weeks = await db
    .select({ id: s.productionWeeks.id, from: s.productionWeeks.startDate, to: s.productionWeeks.endDate })
    .from(s.productionWeeks)
    .where(gte(s.productionWeeks.endDate, first));
  const weekOf = (day: string) => weeks.find((w) => w.from <= day && day <= w.to)?.id ?? null;
  const out: (R & { share: number })[] = [];
  for (const r of rows) {
    if (!r.periodStart) {
      if (inPeriod(r)) out.push({ ...r, share: 1 });
      continue;
    }
    const days = lossDays(r.occurredOn, r.periodStart);
    for (const day of days) {
      if (range && (day < range.from || day > range.to)) continue;
      out.push({ ...r, occurredOn: day, productionWeekId: weekOf(day) ?? r.productionWeekId, share: 1 / days.length });
    }
  }
  return out;
}

export async function adjacentOf(db: Db, period: Period, step: -1 | 1): Promise<Period | null> {
  if (period.kind !== "semaine") return adjacentPeriod(period, step);
  const [week] = await db
    .select({ startDate: s.productionWeeks.startDate })
    .from(s.productionWeeks)
    .where(and(eq(s.productionWeeks.year, period.year), eq(s.productionWeeks.number, period.number)));
  if (!week) return null;
  const [next] = await db
    .select({ year: s.productionWeeks.year, number: s.productionWeeks.number })
    .from(s.productionWeeks)
    .where(step < 0 ? lt(s.productionWeeks.startDate, week.startDate) : gt(s.productionWeeks.startDate, week.startDate))
    .orderBy(step < 0 ? desc(s.productionWeeks.startDate) : asc(s.productionWeeks.startDate))
    .limit(1);
  return adjacentPeriod(period, step, next ?? null);
}

/**
 * Pertes de la période. Par défaut **sans les retours fournisseur** (décision du 19/11/2026 : ils ne comptent pas dans
 * le total perdu) ; `"retours"` donne seulement la part renvoyée, `"tout"` les pertes telles que saisies (valorisation).
 */
export async function loadFacts(
  db: Db,
  user: AuthUser,
  period: Period,
  filters: StatsFilters = {},
  part: "pertes" | "retours" | "tout" = "pertes",
): Promise<LossFact[]> {
  const all = await loadAllFacts(db, user, period, filters);
  if (part === "tout") return all;
  const { losses, returns } = splitSupplierReturns(all);
  return part === "pertes" ? losses : returns;
}

async function loadAllFacts(db: Db, user: AuthUser, period: Period, filters: StatsFilters): Promise<LossFact[]> {
  if (!canReadStats(user)) throw new ForbiddenError();
  const scope = can(user, "stats.compare_teams") ? zonesCondition(user) : scopeCondition(user);
  const inPeriod = await lossesInPeriodCondition(db, period);
  if (scope === null || inPeriod === null) return [];
  const d = s.lossDeclarations;
  const found = await db
    .select()
    .from(d)
    .where(
      and(
        scope,
        inPeriod,
        inArray(d.status, ["validee", "corrigee"]),
        filters.zoneId ? eq(d.zoneId, filters.zoneId) : undefined,
        filters.subzoneId ? eq(d.subzoneId, filters.subzoneId) : undefined,
        filters.teamId ? eq(d.teamId, filters.teamId) : undefined,
        filters.category
          ? eq(d.productCategory, filters.category as (typeof d.productCategory.enumValues)[number])
          : undefined,
        filters.causeId ? eq(d.causeId, filters.causeId) : undefined,
      ),
    )
    .orderBy(asc(d.occurredOn));
  if (!found.length) return [];
  // Pertes de plusieurs jours : réparties sur chaque jour, seuls les jours de la période comptent (26/11/2026).
  const rows = await spreadOverDays(db, found, period);
  if (!rows.length) return [];

  const lines = await db
    .select({
      declarationId: s.declarationDestinations.declarationId,
      revision: s.declarationDestinations.revision,
      destinationId: s.declarationDestinations.destinationId,
      kind: s.destinations.kind,
      quantity: s.declarationDestinations.quantity,
      netKg: s.declarationDestinations.netKg,
      recoveredAmount: s.declarationDestinations.recoveredAmount,
    })
    .from(s.declarationDestinations)
    .innerJoin(s.destinations, eq(s.destinations.id, s.declarationDestinations.destinationId))
    .where(
      inArray(
        s.declarationDestinations.declarationId,
        rows.map((r) => r.id),
      ),
    );
  const withCosts = can(user, "indicators.read");
  const revisionOf = new Map(rows.map((r) => [r.id, r.revision]));
  const destinationsOf = new Map<string, LossFact["destinations"]>();
  for (const l of lines) {
    if (revisionOf.get(l.declarationId) !== l.revision) continue;
    const list = destinationsOf.get(l.declarationId) ?? destinationsOf.set(l.declarationId, []).get(l.declarationId)!;
    list.push({
      destinationId: l.destinationId,
      kind: l.kind,
      quantity: l.quantity,
      netKg: l.netKg,
      recoveredEur: withCosts ? l.recoveredAmount : null,
    });
  }

  // Classement actuel de chaque cause (famille, évitable) : une lecture d'analyse, pas un instantané de la perte.
  const causeRows = await db
    .select({ id: s.causes.id, name: s.causes.name, family: s.causes.family, avoidability: s.causes.avoidability })
    .from(s.causes);
  const causeOf = new Map(causeRows.map((c) => [c.id, c]));

  const facts = rows.map((r): LossFact => {
    // Coût brut figé ; une perte saisie avant le coût brut (Phase 2) compte pour son coût matière (comme « Coûts des pertes »).
    const gross = r.grossCostEur ?? r.materialCostEur;
    // Part du jour pour une perte de plusieurs jours (1 sinon) : kg, quantités et euros répartis à parts égales.
    const k = r.share;
    const part = (v: number) => (k === 1 ? v : v * k);
    const partOrNull = (v: number | null) => (v == null ? null : part(v));
    return {
      id: r.id,
      occurredOn: r.occurredOn,
      productionWeekId: r.productionWeekId,
      zoneId: r.zoneId,
      subzoneId: r.subzoneId,
      teamId: r.teamId,
      category: r.productCategory,
      food: !isNonFoodCategory(r.productCategory),
      // Une formule de plat (VI01) se suit par son code ; une sous-recette, sans code Melba, par son nom normalisé.
      productKey: `${r.productCategory}:${r.productCode ?? tomeKey(r.productName)}`,
      productName: r.productName,
      productCode: r.productCode,
      weekSubRecipeId: r.weekSubRecipeId,
      causeId: r.causeId,
      // Nom actuel de la cause (une cause renommée garde ses pertes passées sous son nouveau nom).
      causeName: causeOf.get(r.causeId)?.name ?? r.causeName,
      causeFamily: causeOf.get(r.causeId)?.family ?? null,
      avoidability: causeOf.get(r.causeId)?.avoidability ?? null,
      supplierId: r.supplierId,
      netKg: partOrNull(r.netKg),
      netQuantity: part(r.netQuantity),
      netUnitCode: r.netUnitCode,
      cost:
        withCosts && (gross != null || r.recoveredEur != null)
          ? {
              materialEur: part(r.materialCostEur ?? 0),
              packagingEur: part(r.packagingCostEur ?? 0),
              labourEur: part(r.labourCostEur ?? 0),
              indirectEur: part(r.indirectCostEur ?? 0),
              grossEur: part(gross ?? 0),
              recoveredEur: part(r.recoveredEur ?? 0),
            }
          : null,
      destinations: (destinationsOf.get(r.id) ?? []).map((x) =>
        k === 1
          ? x
          : {
              ...x,
              quantity: part(x.quantity),
              netKg: partOrNull(x.netKg),
              recoveredEur: partOrNull(x.recoveredEur),
            },
      ),
      ...(k === 1 ? {} : { share: k }),
    };
  });
  return filters.destinationId
    ? facts.filter((f) => f.destinations.some((x) => x.destinationId === filters.destinationId))
    : facts;
}
