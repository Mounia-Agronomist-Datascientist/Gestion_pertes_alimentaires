import { describe, expect, it } from "vitest";
import { reconcile, reconcileTotal } from "@/domain/rapprochement";

const base = { declaredKg: 0, declaredLines: 0, notConverted: 0, measuredKg: 0, bins: 0, covered: true };

describe("rapprochement avec Les Alchimistes", () => {
  it("compare pesé et déclaré : écart en kg et rapporté au poids pesé", () => {
    expect(reconcile({ ...base, declaredKg: 120.5, declaredLines: 14, measuredKg: 181.4, bins: 4 })).toMatchObject({ status: "rapproche", gapKg: 60.9, gapRate: 0.336 });
    // Plus déclaré que pesé : écart négatif.
    expect(reconcile({ ...base, declaredKg: 50, declaredLines: 2, measuredKg: 40, bins: 1 })).toMatchObject({ gapKg: -10, gapRate: -0.25 });
  });

  it("ne rapproche pas une période sans fichier ou sans collecte", () => {
    expect(reconcile({ ...base, declaredKg: 30, declaredLines: 3, covered: false })).toMatchObject({ status: "sans_fichier", gapKg: null, gapRate: null });
    expect(reconcile({ ...base, declaredKg: 30, declaredLines: 3 })).toMatchObject({ status: "sans_collecte", gapKg: null });
    expect(reconcile({ ...base, measuredKg: 80, bins: 2 })).toMatchObject({ status: "sans_declaration", gapKg: 80, gapRate: 1 });
  });

  it("totalise seulement les périodes comparables", () => {
    const rows = [
      reconcile({ ...base, declaredKg: 100, declaredLines: 10, measuredKg: 150, bins: 3 }),
      reconcile({ ...base, declaredKg: 40, declaredLines: 4, covered: false }),
      reconcile({ ...base, declaredKg: 60, declaredLines: 5, measuredKg: 50, bins: 1 }),
    ];
    expect(reconcileTotal(rows)).toMatchObject({ periods: 2, declaredKg: 160, measuredKg: 200, gapKg: 40, gapRate: 0.2, status: "rapproche" });
    expect(reconcileTotal([rows[1]!])).toMatchObject({ periods: 0, status: "sans_fichier", gapKg: null });
  });
});
