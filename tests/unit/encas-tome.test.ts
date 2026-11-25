import { describe, expect, it } from "vitest";
import { compositeSnackKey, isCompositeSnack, snackFacts, type SnackTomeRecipe } from "@/domain/encas-tome";

const line = (label: string, quantity: number, unit: string, unitWeightG: number | null, cost: number | null) => ({
  label,
  key: compositeSnackKey(label),
  isSubRecipe: false,
  quantity,
  unit,
  unitWeightG,
  cost,
});
const recipe = (
  code: string,
  name: string,
  week: number,
  lines: SnackTomeRecipe["lines"],
  g: number,
  cost: number,
) => ({
  year: 2026,
  week,
  code,
  name,
  lines,
  total: { quantity: g, unit: "g", cost },
});

describe("encas lus dans le PDF Melba (R41)", () => {
  const barre = line("Barres de céréales cranberries et chocolat Biscuiterie de Sommières", 1, "Unité (30 g)", 30, 0.9);
  const yaourt = line("Yaourt nature fermier Bastidarra", 2, "pot (125 g)", 125, 0.74);
  const recipes = [
    recipe("EN09_FB", "Barre de céréales pépites de chocolat et cranberries", 45, [barre], 30, 0.9),
    recipe("EN02_EQ", "Yaourt nature Bastidara", 45, [yaourt], 250, 0.74),
    recipe("EN14_LC", "Yaourt nature Bastidara", 45, [yaourt], 250, 0.74),
    recipe("VI01", "Un plat", 45, [line("Riz", 100, "g", null, 0.2)], 300, 2),
    recipe("EN09_FB", "Barre de céréales pépites de chocolat et cranberries", 48, [{ ...barre, cost: 0.95 }], 30, 0.95),
  ];

  it("un article pris une fois : son poids et son prix ; sinon un encas composé en plus", () => {
    expect(isCompositeSnack(recipes[0]!)).toBe(false);
    expect(isCompositeSnack(recipes[1]!)).toBe(true);
    const facts = snackFacts(recipes);
    // Le plat VI01 est ignoré ; le yaourt cité par deux recettes de S45 n'apparaît qu'une fois.
    expect(facts.map((f) => `S${f.week} ${f.composite ? "composé" : "article"} ${f.name}`)).toEqual([
      "S45 article Barres de céréales cranberries et chocolat Biscuiterie de Sommières",
      "S45 article Yaourt nature fermier Bastidarra",
      "S45 composé Yaourt nature Bastidara",
      "S48 article Barres de céréales cranberries et chocolat Biscuiterie de Sommières",
    ]);
    expect(facts[0]).toMatchObject({ unitWeightG: 30, cost: { perUnitEur: 0.9, perKgEur: 30 } });
    expect(facts[1]).toMatchObject({ unitWeightG: 125, cost: { perUnitEur: 0.37 } });
    expect(facts[2]).toMatchObject({ unitWeightG: 250, cost: { perUnitEur: 0.74 }, codes: ["EN02_EQ", "EN14_LC"] });
    expect(facts[3]!.cost.perUnitEur).toBe(0.95);
  });
});
