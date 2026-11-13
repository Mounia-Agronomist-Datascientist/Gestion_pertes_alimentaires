import { describe, expect, it } from "vitest";
import { composition, coverage, estimatedLoss, factorAt, type IngredientFactor, measuredLoss, type RecipeLine, type SubRecipeData } from "@/domain/co2e";

const line = (key: string, quantity: number, unit = "g", extra: Partial<RecipeLine> = {}): RecipeLine => ({ key, isSubRecipe: false, componentSubRecipeId: null, quantity, unit, unitWeightG: null, ...extra });
const FACTORS: Record<string, IngredientFactor> = {
  poulet: { kgCo2ePerKg: 5.6, factorId: "f-poulet" },
  carotte: { kgCo2ePerKg: 0.34, factorId: "f-carotte" },
  sel: { kgCo2ePerKg: 0.6, factorId: "f-sel" },
  poivre: "non_couvert",
  moule: "non_alimentaire",
};
const factorOf = (key: string): IngredientFactor => FACTORS[key] ?? "non_couvert";

describe("CO2e à partir de la recette", () => {
  // Sous-recette : 300 g de carottes donnent 200 g nets.
  const subs = new Map<string, SubRecipeData>([["sr-carotte", { lines: [line("carotte", 300)], netQuantity: 200, netUnit: "g", grossQuantity: 300, grossUnit: "g" }]]);
  const dish = [
    line("poulet", 1, "piece (150 g)", { unitWeightG: 150 }),
    line("sr", 100, "g", { isSubRecipe: true, componentSubRecipeId: "sr-carotte" }),
    line("poivre", 2),
    line("moule", 1, "Unité (30 g)", { unitWeightG: 30 }),
    line("inconnu", 3, "pièces (1 mg)"),
  ];

  it("déroule les sous-recettes et sépare la part couverte", () => {
    const c = composition(dish, subs, factorOf);
    // Poulet 150 g × 5,6 + 100 g de carottes préparées = 150 g crues × 0,34.
    expect(c.co2eKg).toBeCloseTo(0.15 * 5.6 + 0.15 * 0.34, 6);
    expect(c.coveredG).toBeCloseTo(300, 6);
    expect(c.uncoveredG).toBe(2);
    expect(c.unweighed).toBe(1);
    expect([...c.factorIds].sort()).toEqual(["f-carotte", "f-poulet"]);
    expect(coverage(c)).toBeCloseTo(300 / 302, 6);
  });

  it("une perte comptée prend le CO2e par portion, une perte pesée le CO2e au kg", () => {
    const product = { perUnit: 0.891, perKg: 2.97, coverage: 0.99, factorIds: ["f-poulet"] };
    expect(measuredLoss({ netKg: 3, quantity: 10, unitCode: "barquette" }, product)).toMatchObject({ method: "mesure", co2eKg: 8.91, kgMeasured: 2.97, kgUncovered: 0.03 });
    expect(measuredLoss({ netKg: 2, quantity: 2, unitCode: "kg" }, product)).toMatchObject({ co2eKg: 5.94, kgMeasured: 1.98 });
    expect(measuredLoss({ netKg: 2, quantity: 2, unitCode: "kg" }, { ...product, coverage: 0 })).toMatchObject({ method: "non_couvert", co2eKg: 0, kgUncovered: 2 });
    expect(measuredLoss({ netKg: null, quantity: 2, unitCode: "l" }, product)).toMatchObject({ method: "non_couvert", kgUncovered: 0 });
  });

  it("estime une perte hors tome par sa famille, jamais sans facteur", () => {
    expect(estimatedLoss(2, { kgCo2ePerKg: 0.34, factorId: "f" })).toMatchObject({ method: "estime", co2eKg: 0.68, kgEstimated: 2 });
    expect(estimatedLoss(2, null)).toMatchObject({ method: "non_couvert", kgUncovered: 2 });
    expect(estimatedLoss(null, { kgCo2ePerKg: 0.34, factorId: "f" })).toMatchObject({ method: "non_couvert" });
  });

  it("applique la version de facteur en vigueur à la date de la perte", () => {
    const v1 = { id: "v1", familyId: "f", kgCo2ePerKg: 28.9, validatedAt: new Date("2026-11-13T10:00:00Z"), closedAt: new Date("2027-01-10T10:00:00Z") };
    const v2 = { id: "v2", familyId: "f", kgCo2ePerKg: 26, validatedAt: new Date("2027-01-10T10:00:00Z"), closedAt: null };
    expect(factorAt([v2, v1], "2026-10-01")?.id).toBe("v1");
    expect(factorAt([v2, v1], "2026-12-01")?.id).toBe("v1");
    expect(factorAt([v2, v1], "2027-01-10")?.id).toBe("v2");
    expect(factorAt([], "2027-01-10")).toBeNull();
  });
});
