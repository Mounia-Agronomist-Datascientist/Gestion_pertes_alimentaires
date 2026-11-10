import { describe, expect, it } from "vitest";
import { dishUnitCost, estimateLossCost, ingredientUnitCost, subRecipeUnitCost } from "@/domain/couts";

describe("coût matière d'après le tome", () => {
  it("plat : coût de la portion et coût au kg (VI01 S45 : 1,33 € pour 315,1 g)", () => {
    expect(dishUnitCost(1.33, 315.1)).toEqual({ perUnitEur: 1.33, perKgEur: 4.2209 });
    expect(dishUnitCost(null, 315.1)).toEqual({ perUnitEur: null, perKgEur: null });
  });

  it("sous-recette : coût rapporté au poids net après cuisson", () => {
    // Tagliatelles complètes : 0,37 € d'ingrédients pour 140 g nets.
    expect(subRecipeUnitCost(0.37, { quantity: 140, unit: "g" })).toEqual({ perKgEur: 2.6429, perUnitEur: null });
    expect(subRecipeUnitCost(2.5, { quantity: 1.21, unit: "kg" })?.perKgEur).toBe(2.0661);
    expect(subRecipeUnitCost(0.3, null)).toEqual({ perKgEur: null, perUnitEur: null });
  });

  it("ingrédient : au kg s'il est pesé, à la pièce s'il se compte (avec poids unitaire si connu)", () => {
    expect(ingredientUnitCost({ costEur: 0.37, quantity: 77.39, unit: "g", unitWeightG: null })).toEqual({ perKgEur: 4.781, perUnitEur: null });
    expect(ingredientUnitCost({ costEur: 0.74, quantity: 2, unit: "pot (125 g)", unitWeightG: 125 })).toEqual({ perKgEur: 2.96, perUnitEur: 0.37 });
    expect(ingredientUnitCost({ costEur: 0.5, quantity: 5, unit: "pièces (1 mg)", unitWeightG: null })).toEqual({ perKgEur: null, perUnitEur: 0.1 });
  });

  it("estime la perte : au kg en priorité, sinon à l'unité comptée, sinon rien", () => {
    const vi01 = dishUnitCost(1.33, 315.1);
    expect(estimateLossCost({ netKg: 1.2604, quantity: 4, unitCode: "barquette" }, vi01)).toBeCloseTo(5.32, 2);
    expect(estimateLossCost({ netKg: null, quantity: 5, unitCode: "piece" }, { perKgEur: null, perUnitEur: 0.1 })).toBe(0.5);
    expect(estimateLossCost({ netKg: null, quantity: 2, unitCode: "l" }, { perKgEur: 3, perUnitEur: null })).toBeNull();
  });
});
