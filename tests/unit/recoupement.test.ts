import { describe, expect, it } from "vitest";
import { isPriceGap, type OrderedLine, reconcileWeek, type TomeUseLine } from "@/domain/recoupement";

const tome = (over: Partial<TomeUseLine>): TomeUseLine => ({
  label: "Ail pelé",
  key: "ail pele",
  quantity: 100,
  unit: "g",
  unitWeightG: null,
  costEur: 1,
  usedIn: "VI02 Bœuf",
  ...over,
});
const order = (over: Partial<OrderedLine>): OrderedLine => ({
  key: "ail pele",
  designation: "ail pelé",
  supplier: "APO",
  orderNumber: "20261104036",
  deliveryDate: "2026-11-12",
  quantity: 6,
  packagingLabel: "Sachet 5kg",
  totalEur: 285,
  perKgEur: 10,
  perUnitEur: null,
  ...over,
});
const none = { lastOrders: [], otherTomeKeys: new Map<string, string[]>() };

describe("recoupement de la semaine", () => {
  it("rapproche par la clé : commandé, sans commande, absent du tome", () => {
    const r = reconcileWeek({
      ...none,
      tomeLines: [
        tome({}),
        tome({ usedIn: "Sous-recette : sauce" }),
        tome({ label: "Sel fin", key: "sel fin", costEur: 0.05 }),
        tome({ label: "Basilic", key: "basilic", usedIn: "QD01 Pâtes" }),
      ],
      orderLines: [
        order({}),
        order({ key: "saumon keta", designation: "Saumon Keta", supplier: "Metro", perKgEur: 6.5 }),
      ],
      lastOrders: [{ key: "sel fin", supplier: "Pro à Pro", deliveryDate: "2026-11-03" }],
      otherTomeKeys: new Map([["saumon keta", ["S48-2026"]]]),
    });
    expect(r).toMatchObject({ tomeIngredients: 3, orderLines: 2, matched: 1, incomparable: 0, priceGaps: [] });
    expect(r.withoutOrder).toEqual([
      { key: "basilic", name: "Basilic", usedIn: ["QD01 Pâtes"], lastOrder: null },
      {
        key: "sel fin",
        name: "Sel fin",
        usedIn: ["VI02 Bœuf"],
        lastOrder: { supplier: "Pro à Pro", deliveryDate: "2026-11-03" },
      },
    ]);
    expect(r.notInTome).toHaveLength(1);
    expect(r.notInTome[0]).toMatchObject({ designation: "Saumon Keta", otherTomes: ["S48-2026"] });
  });

  it("écart de prix au kg ou à la pièce, au-delà de l'arrondi du tome, du plus grand au plus petit", () => {
    const r = reconcileWeek({
      ...none,
      tomeLines: [
        tome({ label: "Basilic", key: "basilic", quantity: 100, costEur: 3.226 }), // 32,26 €/kg
        tome({ costEur: 1 }), // 10 €/kg
        tome({ label: "Œuf", key: "oeuf", unit: "pièce", quantity: 10, costEur: 2 }), // 0,20 €/pièce
        tome({ label: "Huile", key: "huile", unit: "g", quantity: 100, costEur: 0.4 }),
      ],
      orderLines: [
        order({ key: "basilic", designation: "basilic pdj", perKgEur: 21 }),
        order({ perKgEur: 10.04 }), // arrondi : pas un écart
        order({ key: "oeuf", designation: "oeuf", perKgEur: null, perUnitEur: 0.25 }),
        order({ key: "huile", designation: "huile", perKgEur: null, perUnitEur: null }), // prix au litre : non comparable
      ],
    });
    expect(r.priceGaps.map((g) => [g.name, g.basis, Math.round(g.gap * 100)])).toEqual([
      ["Basilic", "kg", -35],
      ["Œuf", "unit", 25],
    ]);
    expect(r.incomparable).toBe(1);
    expect(r.matched).toBe(4);
  });

  it("plusieurs livraisons de la même matière : la dernière fait foi", () => {
    const r = reconcileWeek({
      ...none,
      tomeLines: [tome({})],
      orderLines: [
        order({ deliveryDate: "2026-11-16", perKgEur: 12 }),
        order({ deliveryDate: "2026-11-12", perKgEur: 10 }),
      ],
    });
    expect(r.priceGaps).toMatchObject([{ deliveryDate: "2026-11-16", orderEur: 12 }]);
  });

  it("seuil d'écart", () => {
    expect(isPriceGap(10, 10.04)).toBe(false);
    expect(isPriceGap(10, 10.1)).toBe(true);
    expect(isPriceGap(0, 1)).toBe(false);
  });
});
