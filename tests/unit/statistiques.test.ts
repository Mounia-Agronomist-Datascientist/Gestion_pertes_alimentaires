import { describe, expect, it } from "vitest";
import { evolution, type LossFact, rankGroups, summarize } from "@/domain/statistiques";

const fact = (over: Partial<LossFact>): LossFact => ({
  id: "x",
  occurredOn: "2026-11-02",
  productionWeekId: "w",
  zoneId: "cuisine",
  subzoneId: "cui",
  teamId: "D",
  category: "recette",
  food: true,
  productKey: "recette:VI01",
  productName: "Plat",
  productCode: "VI01",
  causeId: "c1",
  causeName: "Erreur",
  netKg: 1,
  netQuantity: 1,
  netUnitCode: "kg",
  cost: null,
  destinations: [],
  ...over,
});
const cost = (gross: number, recovered = 0) => ({ materialEur: gross, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: gross, recoveredEur: recovered });

describe("agrégats des statistiques", () => {
  const facts = [
    fact({ netKg: 3.3, netQuantity: 10, netUnitCode: "barquette", cost: cost(13.3, 6), destinations: [{ destinationId: "tgtg", kind: "vente", quantity: 10, netKg: 3.3 }] }),
    fact({ teamId: "C", causeId: "c2", netKg: 1.5, cost: cost(2), destinations: [{ destinationId: "a", kind: "compost", quantity: 1, netKg: 1 }, { destinationId: "d", kind: "don", quantity: 0.5, netKg: 0.5 }] }),
    fact({ netKg: null, netQuantity: 3, netUnitCode: "barquette" }),
    fact({ food: false, category: "consommable", netKg: null, netQuantity: 40, netUnitCode: "piece" }),
  ];

  it("sépare kg alimentaires, pertes non converties et emballages", () => {
    const s = summarize(facts, true);
    expect(s).toMatchObject({ events: 4, foodKg: 4.8, foodNotConverted: 1, barquettes: 13, nonFood: { events: 1, quantities: { piece: 40 } } });
    expect(s.kgByDestinationKind).toEqual({ vente: 3.3, compost: 1, don: 0.5 });
    expect(s.cost).toEqual({ materialEur: 15.3, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: 15.3, recoveredEur: 6, netEur: 9.3, valued: 2 });
  });

  it("ne donne aucun euro sans le droit", () => {
    expect(summarize(facts, false).cost).toBeNull();
  });

  it("classe les groupes et ignore les pertes sans clé", () => {
    expect(rankGroups(facts, (f) => f.teamId, true, "kg").map((g) => [g.key, g.summary.foodKg])).toEqual([["D", 3.3], ["C", 1.5]]);
    expect(rankGroups(facts, (f) => f.teamId, true, "evenements").map((g) => g.key)).toEqual(["D", "C"]);
    expect(rankGroups(facts, (f) => (f.teamId === "C" ? null : f.causeId), true, "cout").map((g) => [g.key, g.summary.events])).toEqual([["c1", 3]]);
  });

  it("calcule l'évolution", () => {
    expect(evolution(12, 10)).toEqual({ delta: 2, percent: 20 });
    expect(evolution(5, 0)).toEqual({ delta: 5, percent: null });
    expect(evolution(5, null)).toBeNull();
  });
});
