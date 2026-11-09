import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";
import { parseTome, tomeKey, unitWeightInGrams } from "@/modules/imports/tome/parse-tome";

// Texte positionné du tome S45 (scripts/extract-tome-fixture.ts) : tableaux seulement, sans commentaires.
const rows = JSON.parse(readFileSync("tests/fixtures/s45/tome-S45.items.json", "utf8")) as [number, number, number, number, number, string][];
const items: PdfItem[] = rows.map(([page, x, y, width, size, text]) => ({ page, x, y, width, size, text }));
const tome = parseTome(items);
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

  it("convertit les poids unitaires en grammes", () => {
    expect(unitWeightInGrams("Pot (125 g)")).toBe(125);
    expect(unitWeightInGrams("seau (1.5 kg)")).toBe(1500);
    expect(unitWeightInGrams("g")).toBeNull();
  });
});
