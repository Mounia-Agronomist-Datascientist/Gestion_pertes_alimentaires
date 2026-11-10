import { describe, expect, it } from "vitest";
import { adjacentPeriod, monthBounds, parsePeriod, periodLabel, periodParams, previousPeriod } from "@/domain/periodes";

describe("périodes des statistiques", () => {
  it("lit et réécrit les paramètres d'adresse", () => {
    for (const p of [
      { kind: "semaine", year: 2026, number: 46 },
      { kind: "mois", year: 2026, month: 11 },
      { kind: "annee", year: 2026 },
      { kind: "periode", from: "2026-11-01", to: "2026-11-15" },
    ] as const) {
      expect(parsePeriod(periodParams(p))).toEqual(p);
    }
  });

  it("refuse les périodes invalides", () => {
    expect(parsePeriod({})).toBeNull();
    expect(parsePeriod({ periode: "semaine", annee: "2026", semaine: "54" })).toBeNull();
    expect(parsePeriod({ periode: "mois", annee: "2026", mois: "13" })).toBeNull();
    expect(parsePeriod({ periode: "periode", du: "2026-11-15", au: "2026-11-01" })).toBeNull();
    expect(parsePeriod({ periode: "periode", du: "2026-02-31", au: "2026-03-01" })).toBeNull();
    expect(parsePeriod({ periode: "periode", du: "2024-01-01", au: "2026-01-01" })).toBeNull();
  });

  it("donne les périodes voisines", () => {
    expect(previousPeriod({ kind: "mois", year: 2026, month: 1 })).toEqual({ kind: "mois", year: 2025, month: 12 });
    expect(previousPeriod({ kind: "annee", year: 2026 })).toEqual({ kind: "annee", year: 2025 });
    expect(previousPeriod({ kind: "periode", from: "2026-11-01", to: "2026-11-07" })).toEqual({ kind: "periode", from: "2026-10-25", to: "2026-10-31" });
    expect(previousPeriod({ kind: "semaine", year: 2026, number: 1 }, { year: 2025, number: 53 })).toEqual({ kind: "semaine", year: 2025, number: 53 });
    expect(previousPeriod({ kind: "semaine", year: 2026, number: 1 }, null)).toBeNull();
    expect(adjacentPeriod({ kind: "mois", year: 2026, month: 12 }, 1)).toEqual({ kind: "mois", year: 2027, month: 1 });
    expect(adjacentPeriod({ kind: "periode", from: "2026-11-01", to: "2026-11-07" }, 1)).toEqual({ kind: "periode", from: "2026-11-08", to: "2026-11-14" });
  });

  it("bornes et libellés", () => {
    expect(monthBounds(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodLabel({ kind: "semaine", year: 2026, number: 6 })).toBe("S06-2026");
    expect(periodLabel({ kind: "mois", year: 2026, month: 8 })).toBe("août 2026");
    expect(periodLabel({ kind: "periode", from: "2026-11-01", to: "2026-11-15" })).toBe("du 01/11/2026 au 15/11/2026");
  });
});
