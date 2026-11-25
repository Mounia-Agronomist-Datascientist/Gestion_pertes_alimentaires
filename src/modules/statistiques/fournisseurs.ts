/**
 * Bilan par fournisseur (décision du 26/11/2026) : pertes de la Réception et du Stockage rangées par fournisseur de
 * la matière, part due à des causes « Fournisseur / matière première », retours fournisseur (hors pertes, avoir
 * attendu), causes et produits principaux. Sert à suivre la qualité des livraisons et à négocier.
 */
import { inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { Period } from "@/domain/periodes";
import { splitSupplierReturns } from "@/domain/retours-fournisseur";
import {
  countLosses,
  type LossFact,
  type RankBy,
  rankGroups,
  type StatsSummary,
  summarize,
} from "@/domain/statistiques";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { loadFacts, type StatsFilters } from "./facts";

export const SUPPLIER_REPORT_ZONE_CODES = ["RECEPTION", "STOCKAGE"] as const;
export const UNKNOWN_SUPPLIER = "inconnu";

export interface SupplierRow {
  key: string;
  name: string;
  summary: StatsSummary;
  /** Kg perdus en Réception et en Stockage. */
  receptionKg: number;
  storageKg: number;
  /** Part des pertes (selon le classement : kg, coût ou nombre) due à une cause « Fournisseur / matière première ». */
  supplierCauseShare: number | null;
  returns: { kg: number; grossEur: number | null; events: number } | null;
  topCauses: { label: string; events: number }[];
  topProducts: { label: string; events: number }[];
}

export async function supplierReport(db: Db, user: AuthUser, period: Period, filters: StatsFilters, by: RankBy) {
  const withCosts = can(user, "indicators.read");
  const zones = await db
    .select({ id: s.zones.id, code: s.zones.code })
    .from(s.zones)
    .where(inArray(s.zones.code, [...SUPPLIER_REPORT_ZONE_CODES]));
  const zoneCode = new Map(zones.map((z) => [z.id, z.code]));
  const all = (await loadFacts(db, user, period, filters, "tout")).filter((f) => zoneCode.has(f.zoneId));
  const { losses, returns } = splitSupplierReturns(all);
  const keyOf = (f: LossFact) => f.supplierId ?? UNKNOWN_SUPPLIER;
  const supplierIds = [...new Set(all.map((f) => f.supplierId).filter((x): x is string => !!x))];
  const names = new Map(
    supplierIds.length
      ? (
          await db
            .select({ id: s.suppliers.id, name: s.suppliers.name })
            .from(s.suppliers)
            .where(inArray(s.suppliers.id, supplierIds))
        ).map((x) => [x.id, x.name])
      : [],
  );
  const value = (x: StatsSummary) => (by === "kg" ? x.foodKg : by === "cout" ? (x.cost?.grossEur ?? 0) : x.events);
  const top = (list: LossFact[], label: (f: LossFact) => string) =>
    [
      ...list.reduce(
        (m, f) => m.set(label(f), (m.get(label(f)) ?? new Set()).add(f.id)),
        new Map<string, Set<string>>(),
      ),
    ]
      .map(([l, ids]) => ({ label: l, events: ids.size }))
      .sort((a, b) => b.events - a.events || a.label.localeCompare(b.label))
      .slice(0, 3);

  const groups = rankGroups(losses, keyOf, withCosts, by);
  const returnKeys = new Set(returns.map(keyOf));
  const keys = [...groups.map((g) => g.key), ...[...returnKeys].filter((k) => !groups.some((g) => g.key === k))];
  const rows: SupplierRow[] = keys.map((key) => {
    const mine = losses.filter((f) => keyOf(f) === key);
    const summary = summarize(mine, withCosts);
    const back = returns.filter((f) => keyOf(f) === key);
    const backSummary = back.length ? summarize(back, withCosts) : null;
    const total = value(summary);
    const fromSupplier = value(
      summarize(
        mine.filter((f) => f.causeFamily === "fournisseur_matiere"),
        withCosts,
      ),
    );
    const kgIn = (code: string) =>
      Math.round(mine.filter((f) => zoneCode.get(f.zoneId) === code).reduce((a, f) => a + (f.netKg ?? 0), 0) * 10) / 10;
    return {
      key,
      name: key === UNKNOWN_SUPPLIER ? "Fournisseur inconnu" : (names.get(key) ?? "Fournisseur inconnu"),
      summary,
      receptionKg: kgIn("RECEPTION"),
      storageKg: kgIn("STOCKAGE"),
      supplierCauseShare: total > 0 ? fromSupplier / total : null,
      returns: backSummary
        ? { kg: backSummary.foodKg, grossEur: backSummary.cost?.grossEur ?? null, events: countLosses(back) }
        : null,
      topCauses: top(mine, (f) => f.causeName),
      topProducts: top(mine, (f) => f.productName),
    };
  });
  return { withCosts, rows, total: countLosses(losses) };
}
