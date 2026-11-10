import { describe, expect, it } from "vitest";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";
import { parseTome, tomeKey, unitWeightInGrams } from "@/modules/imports/tome/parse-tome";
import { s45TomeItems } from "../helpers/s45";

const tome = parseTome(s45TomeItems());
const recipe = (code: string) => tome.recipes.find((r) => r.code === code)!;
const subRecipe = (name: string) => tome.subRecipes.find((s) => s.key === tomeKey(name))!;

describe("lecture du tome Melba S45", () => {
  it("lit les 82 recettes et 105 sous-recettes sans anomalie", () => {
    expect(tome.recipes).toHaveLength(82);
    expect(tome.subRecipes).toHaveLength(105);
    expect(tome.anomalies).toEqual([]);
    expect(new Set(tome.recipes.map((r) => `${r.year}-S${r.week}`))).toEqual(new Set(["2026-S45"]));
  });

  it("lit une recette : nom sur deux lignes, portion, sous-recettes, coûts et total", () => {
    const vi01 = recipe("VI01");
    expect(vi01.name).toBe("Haut de cuisse de poulet rôti, jus au thym, légumes vapeur et semoule de chou-fleur");
    expect(vi01.portionWeightG).toBe(315.1);
    expect(vi01.lines.map((l) => [l.key, l.quantity, l.unit, l.cost])).toEqual([
      ["viande haut de cuisse de poulet roti nature", 1, "recette(s) (105.1 g)", 0.7],
      ["legume roti semoule chou fleur four sec 220 c 15 1 2 sachet pt gastro trou", 70, "g", 0.33],
      ["legume vapeur petit pois", 30, "g", 0.07],
      ["legume vapeur carotte rondelle", 30, "g", 0.08],
      ["sauce sauce poulette au thym", 80, "g", 0.14],
    ]);
    expect(vi01.lines.every((l) => l.isSubRecipe)).toBe(true);
    expect(vi01.total).toEqual({ quantity: 315.11, unit: "g", cost: 1.33 });
  });

  it("recolle un nom écrit sur plusieurs lignes autour de sa quantité, et les ligatures (« fl »)", () => {
    expect(recipe("VI02").lines[0]).toMatchObject({ label: "Cuisson longue 5h45: Sauté de porc au thym (sous recette)", quantity: 70, cost: 0.67 });
    expect(recipe("VI03").name).toBe("Choutiflette");
    expect(recipe("VI03").lines[1]?.label).toBe("Appareil tartiflette Chou-fleur V2 (sous recette)");
  });

  it("lit une sous-recette : quantité de référence, ingrédients, poids brut et poids net", () => {
    const pasta = subRecipe("Féculent: Tagliatelles complètes");
    expect(pasta.reference).toEqual({ quantity: 140, unit: "g" });
    expect(pasta.lines.map((l) => [l.label, l.quantity])).toEqual([
      ["Tagliatelles complètes biovence", 77.39],
      ["Huile d'olive extra vierge", 0.39],
    ]);
    expect(pasta.total).toEqual({ quantity: 77.78, unit: "g", cost: 0.37 });
    expect(pasta.net).toEqual({ quantity: 140, unit: "g", cost: null });
  });

  it("garde le poids unitaire indiqué par Melba et ignore les consignes glissées dans les ingrédients", () => {
    expect(recipe("EN02_EQ").lines[0]).toMatchObject({ quantity: 2, unit: "pot (125 g)", unitWeightG: 125, cost: 0.74 });
    expect(subRecipe("Grana padano poudre déco").lines.map((l) => l.label)).toEqual(["Grana Padano râpé AOP 28,4% MG"]);
  });

  it("chaque sous-recette utilisée est détaillée dans le tome", () => {
    const keys = new Set(tome.subRecipes.map((s) => s.key));
    const used = tome.recipes.flatMap((r) => r.lines).filter((l) => l.isSubRecipe);
    expect(used.length).toBeGreaterThan(150);
    expect(used.every((l) => keys.has(l.key))).toBe(true);
  });
});

describe("lecture du tome : anomalies et formats", () => {
  const item = (page: number, x: number, y: number, size: number, text: string): PdfItem => ({ page, x, y, width: text.length * 4, size, text });
  const table = (y: number) => [item(1, 40, y, 9, "Ingrédients"), item(1, 372, y, 9, "Unité"), item(1, 534, y, 9, "Coût")];

  it("signale une sous-recette non détaillée et des coûts incohérents, sans rien deviner", () => {
    const result = parseTome([
      item(1, 28, 800, 16.5, "2026 S46_VI01-Plat d'essai"),
      item(1, 40, 770, 12, "1 recette(s) (300 g)"),
      ...table(740),
      item(1, 40, 720, 9, "Sauce mystère (sous-recette)"),
      item(1, 325, 720, 9, "100.00"),
      item(1, 372, 720, 9, "g"),
      item(1, 528, 720, 9, "0.50 €"),
      item(1, 40, 700, 9, "Recette totale"),
      item(1, 320, 700, 9, "300.00"),
      item(1, 372, 700, 9, "g"),
      item(1, 528, 700, 9, "2.00 €"),
    ]);
    expect(result.recipes[0]).toMatchObject({ year: 2026, week: 46, code: "VI01", portionWeightG: 300 });
    expect(result.anomalies.map((a) => a.message)).toEqual([
      "Sous-recette « Sauce mystère (sous-recette) » utilisée mais non détaillée dans le tome",
      "Coûts incohérents pour « VI01 – Plat d'essai » : lignes 0.50 € / total 2.00 €",
    ]);
  });

  it("ne lit jamais le texte libre (commentaires)", () => {
    const result = parseTome([
      item(1, 28, 800, 16.5, "Sauce (sous-recette)"),
      item(1, 40, 770, 12, "100 g"),
      ...table(740),
      item(1, 40, 720, 9, "Tomate"),
      item(1, 325, 720, 9, "100.00"),
      item(1, 372, 720, 9, "g"),
      item(1, 528, 720, 9, "0.30 €"),
      item(1, 40, 700, 9, "Recette totale"),
      item(1, 325, 700, 9, "100.00"),
      item(1, 372, 700, 9, "g"),
      item(1, 528, 700, 9, "0.30 €"),
      item(1, 28, 680, 11.2, "Commentaire"),
      item(1, 34, 660, 9.7, "Vu avec un collègue : trop salé"),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/collègue/);
    expect(result.subRecipes[0]).toMatchObject({ name: "Sauce", reference: { quantity: 100, unit: "g" } });
  });

  it("ramène à une portion un tome imprimé pour toute la semaine (« 2792 recette(s) »)", () => {
    const result = parseTome([
      item(1, 28, 800, 16.5, "2026 S46_VG02-Tortilla"),
      item(1, 40, 770, 12, "2792 recette(s) (312.2 g)"),
      item(1, 250, 745, 9, "Quantité pour 2792"),
      item(1, 40, 740, 9, "Ingrédients"),
      item(1, 355, 740, 9, "Unité"),
      item(1, 534, 740, 9, "Coût"),
      item(1, 40, 720, 9, "Plat à gratin (grand format)"),
      item(1, 304, 720, 9, "349.00"),
      item(1, 355, 720, 9, "recette(s) (1 portion(s))"),
      item(1, 522, 720, 9, "91.79 €"),
      item(1, 40, 700, 9, "Base oeufs (sous recette)"),
      item(1, 301, 700, 9, "195440"),
      item(1, 355, 700, 9, "g"),
      item(1, 517, 700, 9, "910.75 €"),
      item(1, 40, 680, 9, "Recette totale"),
      item(1, 304, 680, 9, "871.66"),
      item(1, 355, 680, 9, "kg"),
      item(1, 510, 680, 9, "1,002.54 €"),
      item(1, 28, 600, 16.5, "Base oeufs (sous recette)"),
      item(1, 40, 570, 12, "195440 g"),
      item(1, 40, 540, 9, "Ingrédients"),
      item(1, 372, 540, 9, "Unité"),
      item(1, 534, 540, 9, "Coût"),
      item(1, 40, 520, 9, "Oeuf"),
      item(1, 301, 520, 9, "195440"),
      item(1, 372, 520, 9, "g"),
      item(1, 517, 520, 9, "910.75 €"),
      item(1, 40, 500, 9, "Recette totale"),
      item(1, 301, 500, 9, "195440"),
      item(1, 372, 500, 9, "g"),
      item(1, 517, 500, 9, "910.75 €"),
    ]);
    expect(result.anomalies).toEqual([]);
    const [r] = result.recipes;
    expect(r).toMatchObject({ code: "VG02", recipeCount: 2792, portionWeightG: 312.2, total: { quantity: 0.3122, unit: "kg", cost: 0.3591 } });
    expect(r!.lines.map((l) => [l.quantity, l.cost])).toEqual([
      [0.125, 0.0329],
      [70, 0.3262],
    ]);
  });

  it("convertit les poids unitaires en grammes", () => {
    expect(unitWeightInGrams("Pot (125 g)")).toBe(125);
    expect(unitWeightInGrams("seau (1.5 kg)")).toBe(1500);
    expect(unitWeightInGrams("g")).toBeNull();
  });
});
