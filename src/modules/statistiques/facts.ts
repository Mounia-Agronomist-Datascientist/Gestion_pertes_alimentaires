/**
 * Lecture des pertes pour les statistiques (docs/PHASE4.md, étape 4.1).
 *
 * Toujours filtrée par le périmètre du compte connecté, comme l'historique (docs/SECURITE.md §2) : une équipe ne
 * lit que ses pertes, un responsable de zone ses zones ; les profils qui comparent les équipes (production,
 * direction, administration) voient toute l'entreprise, même sans accès à l'historique (direction). Les déclarations annulées et les brouillons sont exclus ;
 * une perte corrigée compte pour sa dernière version (destinations de cette version). Les euros ne sont transmis
 * qu'aux profils `indicators.read`.
 */
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { adjacentPeriod, monthBounds, type Period } from "@/domain/periodes";
import type { LossFact } from "@/domain/statistiques";
import { type AuthUser, can, ForbiddenError } from "@/modules/auth/permissions";
import { isNonFoodCategory } from "@/modules/declarations/input";
import { scopeCondition } from "@/modules/declarations/queries";

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

/** Condition SQL d'une période ; null si elle ne correspond à aucune semaine du calendrier. */
async function periodCondition(db: Db, period: Period): Promise<SQL | null> {
  switch (period.kind) {
    case "semaine": {
      const [week] = await db
        .select({ id: s.productionWeeks.id })
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, period.year), eq(s.productionWeeks.number, period.number)));
      return week ? eq(s.lossDeclarations.productionWeekId, week.id) : null;
    }
    case "annee": {
      const weeks = await db.select({ id: s.productionWeeks.id }).from(s.productionWeeks).where(eq(s.productionWeeks.year, period.year));
      return weeks.length ? inArray(s.lossDeclarations.productionWeekId, weeks.map((w) => w.id)) : null;
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

export async function loadFacts(db: Db, user: AuthUser, period: Period, filters: StatsFilters = {}): Promise<LossFact[]> {
  if (!canReadStats(user)) throw new ForbiddenError();
  const scope = can(user, "stats.compare_teams") ? undefined : scopeCondition(user);
  const inPeriod = await periodCondition(db, period);
  if (scope === null || inPeriod === null) return [];
  const d = s.lossDeclarations;
  const rows = await db
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
        filters.category ? eq(d.productCategory, filters.category as (typeof d.productCategory.enumValues)[number]) : undefined,
        filters.causeId ? eq(d.causeId, filters.causeId) : undefined,
      ),
    )
    .orderBy(asc(d.occurredOn));
  if (!rows.length) return [];

  const lines = await db
    .select({
      declarationId: s.declarationDestinations.declarationId,
      revision: s.declarationDestinations.revision,
      destinationId: s.declarationDestinations.destinationId,
      kind: s.destinations.kind,
      quantity: s.declarationDestinations.quantity,
      netKg: s.declarationDestinations.netKg,
    })
    .from(s.declarationDestinations)
    .innerJoin(s.destinations, eq(s.destinations.id, s.declarationDestinations.destinationId))
    .where(inArray(s.declarationDestinations.declarationId, rows.map((r) => r.id)));
  const revisionOf = new Map(rows.map((r) => [r.id, r.revision]));
  const destinationsOf = new Map<string, LossFact["destinations"]>();
  for (const l of lines) {
    if (revisionOf.get(l.declarationId) !== l.revision) continue;
    const list = destinationsOf.get(l.declarationId) ?? destinationsOf.set(l.declarationId, []).get(l.declarationId)!;
    list.push({ destinationId: l.destinationId, kind: l.kind, quantity: l.quantity, netKg: l.netKg });
  }

  const withCosts = can(user, "indicators.read");
  const facts = rows.map((r): LossFact => {
    // Coût brut figé ; une perte saisie avant le coût brut (Phase 2) compte pour son coût matière (comme « Coûts des pertes »).
    const gross = r.grossCostEur ?? r.materialCostEur;
    return {
      id: r.id,
      occurredOn: r.occurredOn,
      productionWeekId: r.productionWeekId,
      zoneId: r.zoneId,
      subzoneId: r.subzoneId,
      teamId: r.teamId,
      category: r.productCategory,
      food: !isNonFoodCategory(r.productCategory),
      productKey: `${r.productCategory}:${r.productCode ?? r.productName.trim().toLowerCase()}`,
      productName: r.productName,
      productCode: r.productCode,
      causeId: r.causeId,
      causeName: r.causeName,
      netKg: r.netKg,
      netQuantity: r.netQuantity,
      netUnitCode: r.netUnitCode,
      cost:
        withCosts && (gross != null || r.recoveredEur != null)
          ? {
              materialEur: r.materialCostEur ?? 0,
              packagingEur: r.packagingCostEur ?? 0,
              labourEur: r.labourCostEur ?? 0,
              indirectEur: r.indirectCostEur ?? 0,
              grossEur: gross ?? 0,
              recoveredEur: r.recoveredEur ?? 0,
            }
          : null,
      destinations: destinationsOf.get(r.id) ?? [],
    };
  });
  return filters.destinationId ? facts.filter((f) => f.destinations.some((x) => x.destinationId === filters.destinationId)) : facts;
}
