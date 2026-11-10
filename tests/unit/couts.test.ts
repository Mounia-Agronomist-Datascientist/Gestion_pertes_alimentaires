import { describe, expect, it } from "vitest";
import { dishUnitCost, estimateLossCost, ingredientUnitCost, lossCostBreakdown, mouldCostOf, subRecipeUnitCost } from "@/domain/couts";

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

  it("estime la perte : à l'unité comptée en priorité, sinon au kg, sinon rien", () => {
    const vi01 = dishUnitCost(1.33, 315.1);
    expect(estimateLossCost({ netKg: 1.2604, quantity: 4, unitCode: "barquette" }, vi01)).toBeCloseTo(5.32, 2);
    expect(estimateLossCost({ netKg: null, quantity: 5, unitCode: "piece" }, { perKgEur: null, perUnitEur: 0.1 })).toBe(0.5);
    expect(estimateLossCost({ netKg: null, quantity: 2, unitCode: "l" }, { perKgEur: 3, perUnitEur: null })).toBeNull();
  });
});

describe("coût brut par composante", () => {
  const vi03 = { food: { perUnitEur: 1.39, perKgEur: 4.4695 }, packagingPerPortionEur: 0.22, portionWeightKg: 0.311 };

  it("barquettes comptées : matières + emballages par portion", () => {
    expect(lossCostBreakdown({ netKg: 1.244, quantity: 4, unitCode: "barquette" }, vi03)).toMatchObject({
      portions: 4,
      foodEur: 5.56,
      packagingEur: 0.88,
      grossEur: 6.44,
      labourEur: null,
      indirectEur: null,
    });
  });

  it("plat pesé : portions = poids net ÷ poids d'une portion", () => {
    expect(lossCostBreakdown({ netKg: 3.11, quantity: 3.11, unitCode: "kg" }, vi03)).toMatchObject({ portions: 10, packagingEur: 2.2 });
  });

  it("moule perdu : son coût va dans les emballages ; rien de connu → coût brut vide", () => {
    const none = { perKgEur: null, perUnitEur: null };
    expect(
      lossCostBreakdown({ netKg: null, quantity: 5, unitCode: "piece" }, { food: none, packagingPerPortionEur: null, portionWeightKg: null, packagingItself: { perKgEur: null, perUnitEur: 0.1 } }),
    ).toMatchObject({ foodEur: null, packagingEur: 0.5, grossEur: 0.5 });
    expect(lossCostBreakdown({ netKg: 2, quantity: 2, unitCode: "kg" }, { food: none, packagingPerPortionEur: null, portionWeightKg: null }).grossEur).toBeNull();
  });

  it("isole les moules inclus dans le coût Melba, y compris dans une sous-recette (au prorata)", () => {
    const isMould = (l: string) => /moule|plat à gratin/i.test(l);
    const subs = new Map([
      ["quiche", { totalCostEur: 1.0, lines: [{ label: "Appareil", costEur: 0.8, subRecipeId: null }, { label: "Moule rond", costEur: 0.2, subRecipeId: null }] }],
    ]);
    const lines = [
      { label: "Petit plat à gratin format individuel", costEur: 0.07, subRecipeId: null },
      { label: "Quiche (sous-recette)", costEur: 0.5, subRecipeId: "quiche" },
      { label: "Salade", costEur: 0.3, subRecipeId: null },
    ];
    expect(mouldCostOf(lines, subs, isMould)).toBe(0.17); // 0,07 + 0,5 × (0,2 / 1,0)
  });
});
