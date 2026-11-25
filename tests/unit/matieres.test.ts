import { describe, expect, it } from "vitest";
import {
  kgPriceFallback,
  materialsForPlace,
  type PriceVersion,
  priceInForce,
  samePrice,
  tomeMaterials,
} from "@/domain/matieres";

const line = (over: Partial<Parameters<typeof tomeMaterials>[0][number]>) => ({
  label: "Sel fin",
  key: "sel fin",
  quantity: 100,
  unit: "g",
  unitWeightG: null,
  costEur: 0.05,
  ...over,
});

describe("matières tirées d'un tome", () => {
  it("garde une matière par clé, d'après la ligne pesée la plus grande", () => {
    const materials = tomeMaterials([
      line({ unit: "pincée (1 g)", quantity: 3, unitWeightG: 1, costEur: 0.01 }),
      line({ quantity: 200, costEur: 0.1 }),
      line({ quantity: 50, costEur: 0.03 }),
      line({
        label: "Pot de yaourt (sous-recette)",
        key: "pot de yaourt",
        unit: "pot (125 g)",
        quantity: 4,
        unitWeightG: 125,
        costEur: 2,
      }),
    ]);
    expect(materials).toEqual([
      {
        key: "pot de yaourt",
        name: "Pot de yaourt",
        unit: "pot (125 g)",
        unitWeightG: 125,
        cost: { perKgEur: 4, perUnitEur: 0.5 },
      },
      { key: "sel fin", name: "Sel fin", unit: "g", unitWeightG: null, cost: { perKgEur: 0.5, perUnitEur: null } },
    ]);
  });

  it("préfère une ligne avec un coût à une ligne sans coût", () => {
    const [m] = tomeMaterials([line({ quantity: 500, costEur: null }), line({ quantity: 10, costEur: 0.02 })]);
    expect(m!.cost.perKgEur).toBe(2);
  });

  it("compare prix et unité", () => {
    const a = { unit: "g", unitWeightG: null, perKgEur: 2, perUnitEur: null };
    expect(samePrice(a, { ...a })).toBe(true);
    expect(samePrice(a, { ...a, perKgEur: 2.1 })).toBe(false);
    // Arrondi du tome (coût imprimé au centime) : pas un changement de prix.
    expect(samePrice({ ...a, perKgEur: 4.1094 }, { ...a, perKgEur: 4.1095 })).toBe(true);
    expect(samePrice({ ...a, perKgEur: 3.4409 }, { ...a, perKgEur: 3.45 })).toBe(true);
    expect(samePrice({ ...a, perKgEur: 3.4 }, { ...a, perKgEur: 3.45 })).toBe(false);
    expect(samePrice(a, { ...a, perKgEur: null })).toBe(false);
    expect(samePrice(a, { ...a, unit: "pot (125 g)" })).toBe(false);
  });
});

describe("prix en vigueur", () => {
  const v = (source: PriceVersion["source"], validFrom: string, perKgEur: number): PriceVersion => ({
    source,
    validFrom,
    unit: "g",
    unitWeightG: null,
    perKgEur,
    perUnitEur: null,
  });
  const versions = [v("tome", "2026-10-29", 2), v("tome", "2026-11-05", 2.5), v("bon_commande", "2026-11-03", 2.2)];

  it("aucun prix avant la première version", () => {
    expect(priceInForce(versions, "2026-10-28")).toBeNull();
  });

  it("le coût du tome tant qu'aucun bon de commande n'a commencé", () => {
    expect(priceInForce(versions, "2026-11-01")!.perKgEur).toBe(2);
  });

  it("le dernier prix d'achat ensuite, même si un tome plus récent existe", () => {
    expect(priceInForce(versions, "2026-11-03")!.perKgEur).toBe(2.2);
    expect(priceInForce(versions, "2026-11-10")!.perKgEur).toBe(2.2);
  });

  it("une correction manuelle passe devant un bon de commande du même jour", () => {
    expect(priceInForce([...versions, v("manuel", "2026-11-03", 3)], "2026-11-04")!.perKgEur).toBe(3);
  });
});

describe("matières de la semaine par lieu de saisie", () => {
  const m = (name: string, categoryId: string | null) => ({ name, categoryId });
  const materials = [m("ail pelé", "legume"), m("bœuf", "viande"), m("sel", null), m("épices", "epicerie")];
  const storageOf = new Map<string, string | null>([
    ["legume", "LEGUMERIE"],
    ["viande", "BOF"],
    ["epicerie", null],
  ]);

  it("Réception : toutes les matières", () => {
    expect(materialsForPlace(materials, storageOf, { zoneCode: "RECEPTION", subzoneId: "REC" })).toEqual({
      here: materials,
      unplaced: [],
    });
  });

  it("Stockage : celles du lieu, et à part celles sans lieu réglé", () => {
    const r = materialsForPlace(materials, storageOf, { zoneCode: "STOCKAGE", subzoneId: "LEGUMERIE" });
    expect(r.here.map((x) => x.name)).toEqual(["ail pelé"]);
    expect(r.unplaced.map((x) => x.name)).toEqual(["sel", "épices"]);
  });

  it("Stockage : le lieu propre au produit passe avant celui de sa catégorie", () => {
    const withOwn = [
      ...materials,
      { name: "beurre", categoryId: "viande", storageSubzoneId: "LEGUMERIE" },
      { name: "sel de Guérande", categoryId: null, storageSubzoneId: "BOF" },
    ];
    const r = materialsForPlace(withOwn, storageOf, { zoneCode: "STOCKAGE", subzoneId: "LEGUMERIE" });
    expect(r.here.map((x) => x.name)).toEqual(["ail pelé", "beurre"]);
    expect(r.unplaced.map((x) => x.name)).toEqual(["sel", "épices"]);
    expect(
      materialsForPlace(withOwn, storageOf, { zoneCode: "STOCKAGE", subzoneId: "BOF" }).here.map((x) => x.name),
    ).toEqual(["bœuf", "sel de Guérande"]);
  });
});

describe("prix au kg de secours (26/11/2026)", () => {
  const box = { perKgEur: null, perUnitEur: 4.5 };
  it("prix au kg déjà connu, ou perte comptée à l'unité : rien à changer", () => {
    expect(
      kgPriceFallback({ perKgEur: 2, perUnitEur: null }, { countedInUnits: false, tomePerKgEur: 1, colisKg: 4 }),
    ).toBeNull();
    expect(kgPriceFallback(box, { countedInUnits: true, tomePerKgEur: 1.2, colisKg: null })).toBeNull();
  });
  it("tome au kg d'abord, sinon prix de l'unité ÷ poids du colis", () => {
    expect(kgPriceFallback(box, { countedInUnits: false, tomePerKgEur: 1.2, colisKg: 4 })).toEqual({
      perKgEur: 1.2,
      basis: "tome_au_kg",
    });
    expect(kgPriceFallback(box, { countedInUnits: false, tomePerKgEur: null, colisKg: 4 })).toEqual({
      perKgEur: 1.125,
      basis: "prix_du_colis",
    });
    expect(kgPriceFallback(box, { countedInUnits: false, tomePerKgEur: null, colisKg: null })).toBeNull();
  });
});
