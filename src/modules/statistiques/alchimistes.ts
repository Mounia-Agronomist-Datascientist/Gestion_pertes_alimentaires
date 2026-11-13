/**
 * Onglet « Alchimistes » (docs/PHASE5.md, étape 5.3) : kg déclarés vers Les Alchimistes comparés aux kg qu'ils
 * ont pesés, sur les 12 dernières semaines de production et les 12 derniers mois. Toute l'entreprise seulement
 * (les pesées ne se répartissent pas par zone ni par équipe) : réservé aux profils qui comparent les équipes.
 */
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { monthBounds } from "@/domain/periodes";
import { reconcile, type ReconciliationRow, reconcileTotal } from "@/domain/rapprochement";
import { type AuthUser, can, ForbiddenError } from "@/modules/auth/permissions";
import { recentWeeks } from "./evolution";
import { loadFacts } from "./facts";

/** Destination des Alchimistes (code du référentiel). */
export const ALCHIMISTES_CODE = "ALCHIMISTES";

export interface ReconciliationPeriod extends ReconciliationRow {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function canReadReconciliation(user: AuthUser): boolean {
  return can(user, "stats.compare_teams");
}

export async function alchimistesReconciliation(db: Db, user: AuthUser, anchor: { year: number; number: number }) {
  if (!canReadReconciliation(user)) throw new ForbiddenError();
  const weeks = await recentWeeks(db, anchor, 12);
  if (!weeks?.length) return null;
  const end = weeks.at(-1)!.endDate;
  const months = Array.from({ length: 12 }, (_, i) => {
    const index = Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7)) - 1 - (11 - i);
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return { year, month, ...monthBounds(year, month) };
  });
  const from = [weeks[0]!.startDate, months[0]!.from].sort()[0]!;
  const to = [end, months.at(-1)!.to].sort().at(-1)!;

  const [[destination], facts, collections, imports] = await Promise.all([
    db.select({ id: s.destinations.id, name: s.destinations.name }).from(s.destinations).where(eq(s.destinations.code, ALCHIMISTES_CODE)),
    loadFacts(db, user, { kind: "periode", from, to }),
    db
      .select({ date: s.alchimistesCollections.collectedOn, weekId: s.alchimistesCollections.productionWeekId, kg: s.alchimistesCollections.netKg })
      .from(s.alchimistesCollections)
      .where(and(isNull(s.alchimistesCollections.replacedByImportId), gte(s.alchimistesCollections.collectedOn, from), lte(s.alchimistesCollections.collectedOn, to))),
    db
      .select({ from: s.alchimistesImports.periodFrom, to: s.alchimistesImports.periodTo })
      .from(s.alchimistesImports)
      .where(and(lte(s.alchimistesImports.periodFrom, to), gte(s.alchimistesImports.periodTo, from))),
  ]);

  // Lignes déclarées vers Les Alchimistes : date de la perte, semaine de production, kg (aliments seulement).
  const lines = facts.flatMap((f) =>
    f.destinations
      .filter((d) => d.destinationId === destination?.id)
      .map((d) => ({ date: f.occurredOn, weekId: f.productionWeekId, kg: f.food ? d.netKg : null, notConverted: f.food && d.netKg == null })),
  );
  const row = (inPeriod: (x: { date: string; weekId: string }) => boolean, periodFrom: string, periodTo: string) => {
    const declared = lines.filter(inPeriod);
    const measured = collections.filter(inPeriod);
    return reconcile({
      declaredKg: declared.reduce((a, l) => a + (l.kg ?? 0), 0),
      declaredLines: declared.length,
      notConverted: declared.filter((l) => l.notConverted).length,
      measuredKg: measured.reduce((a, c) => a + c.kg, 0),
      bins: measured.length,
      covered: imports.some((i) => i.from <= periodTo && i.to >= periodFrom),
    });
  };

  const weekRows: ReconciliationPeriod[] = weeks.map((w) => ({
    key: w.id,
    label: `S${String(w.number).padStart(2, "0")}-${w.year}`,
    from: w.startDate,
    to: w.endDate,
    ...row((x) => x.weekId === w.id, w.startDate, w.endDate),
  }));
  const monthRows: ReconciliationPeriod[] = months.map((m) => ({
    key: `${m.year}-${m.month}`,
    label: `${m.from.slice(5, 7)}/${m.year}`,
    from: m.from,
    to: m.to,
    ...row((x) => x.date >= m.from && x.date <= m.to, m.from, m.to),
  }));

  return {
    destinationName: destination?.name ?? null,
    weeks: weekRows,
    weeksTotal: reconcileTotal(weekRows),
    months: monthRows,
    monthsTotal: reconcileTotal(monthRows),
  };
}

/** Bacs pesés d'une semaine (détail sous le tableau). */
export async function weekCollections(db: Db, user: AuthUser, weekIds: readonly string[]) {
  if (!canReadReconciliation(user)) throw new ForbiddenError();
  if (!weekIds.length) return [];
  return db
    .select({
      weekId: s.alchimistesCollections.productionWeekId,
      date: s.alchimistesCollections.collectedOn,
      kg: s.alchimistesCollections.netKg,
      containerNumber: s.alchimistesCollections.containerNumber,
      quality: s.alchimistesCollections.quality,
      incident: s.alchimistesCollections.incident,
    })
    .from(s.alchimistesCollections)
    .where(and(isNull(s.alchimistesCollections.replacedByImportId), inArray(s.alchimistesCollections.productionWeekId, [...weekIds])))
    .orderBy(s.alchimistesCollections.collectedOn);
}
