import { describe, expect, it } from "vitest";
import { type PriceVersion, priceInForce, samePrice, tomeMaterials } from "@/domain/matieres";

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
      line({ label: "Pot de yaourt (sous-recette)", key: "pot de yaourt", unit: "pot (125 g)", quantity: 4, unitWeightG: 125, costEur: 2 }),
    ]);
    expect(materials).toEqual([
      { key: "pot de yaourt", name: "Pot de yaourt", unit: "pot (125 g)", unitWeightG: 125, cost: { perKgEur: 4, perUnitEur: 0.5 } },
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
  const v = (source: PriceVersion["source"], validFrom: string, perKgEur: number): PriceVersion => ({ source, validFrom, unit: "g", unitWeightG: null, perKgEur, perUnitEur: null });
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
