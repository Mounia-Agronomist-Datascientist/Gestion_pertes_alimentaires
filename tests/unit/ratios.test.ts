import { describe, expect, it } from "vitest";
import { summarize } from "@/domain/statistiques";
import { ratiosOf } from "@/modules/statistiques/ratios";

const summary = (foodKg: number, barquettes: number, materialEur: number) => ({
  ...summarize([], true),
  foodKg,
  barquettes,
  cost: { materialEur, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: materialEur, recoveredEur: 0, netEur: materialEur, valued: 1 },
});
const volume = (barquettes: number, kg: number | null, costEur: number | null) => ({ barquettes, kg, dishesWithoutWeight: kg == null ? 1 : 0, costEur, dishesWithoutCost: costEur == null ? 1 : 0 });

describe("ratios de pertes", () => {
  it("calcule les trois ratios sur les seules semaines qui ont le dénominateur", () => {
    const r = ratiosOf(
      [
        { summary: summary(30, 100, 50), volume: volume(10_000, 3_300, 14_000) },
        { summary: summary(12, 40, 20), volume: null },
        { summary: summary(10, 0, 10), volume: volume(10_000, 3_200, 13_000) },
      ],
      true,
    )!;
    expect(r).toMatchObject({ weeks: 2, lostBarquettes: 100, producedBarquettes: 20_000, barquetteRate: 0.005, foodKg: 40, producedKg: 6_500, materialLossEur: 60, productionCostEur: 27_000 });
    expect(r.kgRate).toBeCloseTo(0.0062, 4);
    expect(r.costRate).toBeCloseTo(0.0022, 4);
  });

  it("ne calcule pas un ratio sans dénominateur complet, ni d'euros sans le droit", () => {
    expect(ratiosOf([{ summary: summary(1, 1, 1), volume: null }], true)).toBeNull();
    const r = ratiosOf([{ summary: summary(5, 2, 3), volume: volume(1_000, null, null) }], false)!;
    expect(r).toMatchObject({ barquetteRate: 0.002, producedKg: null, kgRate: null, materialLossEur: null, costRate: null, incomplete: { weight: 1, cost: 1 } });
  });
});
