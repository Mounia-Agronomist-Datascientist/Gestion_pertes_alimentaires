import { describe, expect, it } from "vitest";
import { type SurplusFact, summarizeSurplus, surplusTrays } from "@/domain/surplus";

const fact = (f: Partial<SurplusFact> & Pick<SurplusFact, "source" | "kind">): SurplusFact => ({
  occurredOn: "2026-11-02",
  trays: 0,
  breakfastTrays: 0,
  offeredTrays: null,
  boxes: null,
  breakfastBoxes: null,
  amountEur: null,
  netKg: null,
  costEur: null,
  collected: null,
  ...f,
});

const facts: SurplusFact[] = [
  fact({ source: "tgtg", kind: "vente", trays: 480, offeredTrays: 540, amountEur: 1999.2 }),
  fact({ source: "tgtg", kind: "vente", trays: 105, offeredTrays: 105 }),
  fact({ source: "tgtg", kind: "versement", amountEur: 4276.68 }),
  fact({
    source: "vente_flash",
    kind: "vente",
    boxes: 41,
    breakfastBoxes: 18,
    trays: 410,
    breakfastTrays: 90,
    amountEur: 3050,
  }),
  fact({
    source: "linkee",
    kind: "don",
    occurredOn: "2026-11-02",
    trays: 36,
    netKg: 12.6,
    costEur: 47.88,
    collected: true,
  }),
  fact({ source: "linkee", kind: "don", occurredOn: "2026-11-02", trays: 144, collected: true }),
  fact({
    source: "linkee",
    kind: "don",
    occurredOn: "2026-11-09",
    trays: 30,
    netKg: 10.5,
    costEur: 39.9,
    collected: false,
  }),
];

describe("ventes et dons des surplus", () => {
  it("additionne chaque canal sans mélanger les bases de montants", () => {
    const t = summarizeSurplus(facts, true);
    expect(t.tgtg).toEqual({
      sales: 2,
      offeredTrays: 645,
      trays: 585,
      clientEur: 1999.2,
      missingAmount: 1,
      payouts: 1,
      receivedEur: 4276.68,
    });
    expect(t.flash).toEqual({
      sales: 1,
      boxes: 41,
      breakfastBoxes: 18,
      trays: 410,
      breakfastTrays: 90,
      revenueEur: 3050,
      missingAmount: 0,
    });
    expect(t.linkee).toEqual({
      collections: 2,
      dishes: 3,
      trays: 210,
      notCollectedTrays: 30,
      kg: 23.1,
      weighedTrays: 66,
      costEur: 87.78,
      costedTrays: 66,
    });
    expect(surplusTrays(t)).toEqual({ tgtg: 585, vente_flash: 500, linkee: 210 });
  });

  it("masque les euros sans le droit aux indicateurs économiques", () => {
    const t = summarizeSurplus(facts, false);
    expect([t.tgtg.clientEur, t.tgtg.receivedEur, t.flash.revenueEur, t.linkee.costEur]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(t.linkee.kg).toBe(23.1);
  });
});
