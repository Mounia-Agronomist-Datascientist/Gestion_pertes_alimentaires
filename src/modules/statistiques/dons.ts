/**
 * Registre des dons (décision du 26/11/2026) : chaque don d'une période, pour les justificatifs (reçus fiscaux des
 * associations, démarche anti-gaspillage). Deux origines : les pertes déclarées vers une destination « don »
 * (association…) et les dons de barquettes à Linkee lus dans le fichier des surplus. Valeur au coût de revient figé
 * (matières, et emballages comptés sur la perte), hors taxes.
 */
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { Period } from "@/domain/periodes";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { loadFacts, periodRange, type StatsFilters } from "./facts";

export interface DonationRow {
  date: string;
  beneficiary: string;
  origin: "perte" | "linkee";
  zone: string | null;
  product: string;
  quantity: number;
  unit: string;
  kg: number | null;
  /** Coût de revient HT de la part donnée ; null si inconnu ou non visible pour ce profil. */
  valueEur: number | null;
  lots: string | null;
  bestBefore: string | null;
}

export async function donationRegister(db: Db, user: AuthUser, period: Period, filters: StatsFilters = {}) {
  const withCosts = can(user, "indicators.read");
  const facts = (await loadFacts(db, user, period, filters)).filter((f) =>
    f.destinations.some((d) => d.kind === "don"),
  );
  const destinationIds = [...new Set(facts.flatMap((f) => f.destinations.map((d) => d.destinationId)))];
  const [destinations, zones, lotRows] = await Promise.all([
    destinationIds.length
      ? db.select().from(s.destinations).where(inArray(s.destinations.id, destinationIds))
      : Promise.resolve([]),
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones),
    facts.length
      ? db
          .select({ id: s.lossDeclarations.id, lots: s.lossDeclarations.lots })
          .from(s.lossDeclarations)
          .where(
            inArray(
              s.lossDeclarations.id,
              facts.map((f) => f.id),
            ),
          )
      : Promise.resolve([]),
  ]);
  const destName = new Map(destinations.map((d) => [d.id, d.name]));
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const lotsOf = new Map(lotRows.map((r) => [r.id, r.lots ?? []]));
  const rows: DonationRow[] = [];
  for (const f of facts) {
    const total = f.destinations.reduce((a, d) => a + d.quantity, 0);
    const lots = lotsOf.get(f.id) ?? [];
    for (const d of f.destinations.filter((x) => x.kind === "don")) {
      const share = total > 0 ? d.quantity / total : 0;
      rows.push({
        date: f.occurredOn,
        beneficiary: destName.get(d.destinationId) ?? "Don",
        origin: "perte",
        zone: zoneName.get(f.zoneId) ?? null,
        product: f.productCode ? `${f.productCode} ${f.productName}` : f.productName,
        quantity: Math.round(d.quantity * 1000) / 1000,
        unit: f.netUnitCode,
        kg: d.netKg == null ? null : Math.round(d.netKg * 1000) / 1000,
        valueEur: withCosts && f.cost && f.cost.grossEur > 0 ? Math.round(f.cost.grossEur * share * 100) / 100 : null,
        lots:
          lots
            .map((l) => l.lotNumber)
            .filter(Boolean)
            .join(", ") || null,
        bestBefore:
          lots
            .map((l) => l.dlc)
            .filter(Boolean)
            .join(", ") || null,
      });
    }
  }

  // Dons de barquettes à Linkee (fichier des ventes et dons des surplus), dans la même période.
  const range = await periodRange(db, period);
  if (range && !filters.zoneId && !filters.teamId && can(user, "stats.compare_teams")) {
    const linkee = await db
      .select()
      .from(s.surplusEntries)
      .where(
        and(
          eq(s.surplusEntries.kind, "don"),
          isNull(s.surplusEntries.replacedByImportId),
          gte(s.surplusEntries.occurredOn, range.from),
          lte(s.surplusEntries.occurredOn, range.to),
        ),
      );
    for (const e of linkee) {
      rows.push({
        date: e.occurredOn,
        beneficiary: e.source === "linkee" ? "Linkee" : "Don",
        origin: "linkee",
        zone: null,
        product: [e.dishCode, e.dishName].filter(Boolean).join(" ") || "Barquettes",
        quantity: e.trays + e.breakfastTrays,
        unit: "barquette",
        kg: e.netKg,
        valueEur: withCosts ? e.costEur : null,
        lots: e.lot,
        bestBefore: e.bestBefore,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.beneficiary.localeCompare(b.beneficiary));
  return { withCosts, rows };
}
