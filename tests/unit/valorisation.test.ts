import { describe, expect, it } from "vitest";
import type { LossFact } from "@/domain/statistiques";
import { recoveredShare, recoveryGroupOf, recoveryPerKg, recoverySummary } from "@/domain/valorisation";

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
  weekSubRecipeId: null,
  causeId: "c1",
  causeName: "Erreur",
  netKg: 1,
  netQuantity: 1,
  netUnitCode: "kg",
  cost: null,
  destinations: [],
  ...over,
});
const cost = (gross: number) => ({ materialEur: gross, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: gross, recoveredEur: 0 });
const line = (destinationId: string, kind: string, quantity: number, netKg: number | null, recoveredEur: number | null = null) => ({ destinationId, kind, quantity, netKg, recoveredEur });

describe("valorisation", () => {
  const facts = [
    // 10 barquettes (4 kg) à 20 € : 6 vendues sur TGTG (12 €), 4 compostées.
    fact({ netKg: 4, netQuantity: 10, netUnitCode: "barquette", cost: cost(20), destinations: [line("tgtg", "vente", 6, 2.4, 12), line("alc", "compost", 4, 1.6)] }),
    // Vente flash sans recette saisie.
    fact({ netKg: 1, cost: cost(5), destinations: [line("flash", "vente", 1, 1)] }),
    // Réutilisation et retour fournisseur : à part.
    fact({ netKg: 2, netQuantity: 2, cost: cost(3), destinations: [line("reu", "reutilisation", 1.5, 1.5), line("ret", "retour_fournisseur", 0.5, 0.5)] }),
    // Barquettes non converties et emballages : jamais en kg ; perte sans coût.
    fact({ netKg: null, netQuantity: 3, netUnitCode: "barquette", destinations: [line("don", "don", 3, null)] }),
    fact({ food: false, category: "consommable", netKg: null, netQuantity: 40, netUnitCode: "piece", cost: cost(8), destinations: [line("ord", "destruction", 40, null)] }),
  ];

  it("classe les destinations en trois groupes", () => {
    expect(["vente", "destruction", "compost", "don", "personnel", "autre", "reutilisation", "retour_fournisseur"].map(recoveryGroupOf)).toEqual([
      "avec_recette",
      "sans_recette",
      "sans_recette",
      "sans_recette",
      "sans_recette",
      "sans_recette",
      "a_part",
      "a_part",
    ]);
  });

  it("totalise kg, coût au prorata et recettes par groupe", () => {
    const { groups, destinations } = recoverySummary(facts, true);
    expect(groups.avec_recette).toEqual({
      lines: 2,
      foodKg: 3.4,
      notConverted: 0,
      nonFood: 0,
      cost: { grossEur: 17, unvalued: 0, recoveredEur: 12, recoveryMissing: 1, kgWithRecovery: 2.4 },
    });
    expect(groups.sans_recette).toMatchObject({ lines: 3, foodKg: 1.6, notConverted: 1, nonFood: 1, cost: { grossEur: 16, unvalued: 1, recoveredEur: 0 } });
    expect(groups.a_part).toMatchObject({ lines: 2, foodKg: 2, cost: { grossEur: 3 } });
    expect(destinations.map((d) => [d.destinationId, d.foodKg])).toEqual([
      ["tgtg", 2.4],
      ["alc", 1.6],
      ["reu", 1.5],
      ["flash", 1],
      ["ret", 0.5],
      ["don", 0],
      ["ord", 0],
    ]);
    expect(recoveredShare(groups.avec_recette)).toBe(0.706);
    expect(recoveryPerKg(groups.avec_recette)).toBe(5);
  });

  it("ne donne aucun euro sans le droit", () => {
    const { groups } = recoverySummary(facts, false);
    expect(groups.avec_recette.cost).toBeNull();
    expect(recoveredShare(groups.avec_recette)).toBeNull();
  });
});
