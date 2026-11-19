import { describe, expect, it } from "vitest";
import { commentRequiredFor, destinationAllowedIn } from "@/domain/devenirs";
import { zoneFlow } from "@/domain/flux-zones";
import { splitSupplierReturns } from "@/domain/retours-fournisseur";
import { type LossFact, summarize } from "@/domain/statistiques";

const fact = (id: string, destinations: [string, number][], over: Partial<LossFact> = {}): LossFact => ({
  id,
  occurredOn: "2026-11-19",
  productionWeekId: "w",
  zoneId: "rec",
  subzoneId: "rec-1",
  teamId: null,
  category: "matiere_premiere",
  food: true,
  productKey: id,
  productName: id,
  productCode: null,
  weekSubRecipeId: null,
  causeId: "c",
  causeName: "Cause",
  netKg: 10,
  netQuantity: 10,
  netUnitCode: "kg",
  cost: { materialEur: 40, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: 40, recoveredEur: 0 },
  destinations: destinations.map(([kind, quantity]) => ({
    destinationId: kind,
    kind,
    quantity,
    netKg: quantity,
    recoveredEur: null,
  })),
  ...over,
});

describe("retours fournisseur hors du total perdu (décision du 19/11/2026)", () => {
  it("une perte renvoyée en entier ne compte pas ; une perte répartie est coupée au prorata", () => {
    const { losses, returns } = splitSupplierReturns([
      fact("tout-renvoye", [["retour_fournisseur", 10]]),
      fact("moitie", [
        ["retour_fournisseur", 4],
        ["compost", 6],
      ]),
      fact("compost", [["compost", 10]]),
    ]);
    expect(losses.map((f) => [f.id, f.netKg, f.cost?.grossEur])).toEqual([
      ["moitie", 6, 24],
      ["compost", 10, 40],
    ]);
    expect(returns.map((f) => [f.id, f.netKg, f.cost?.grossEur])).toEqual([
      ["tout-renvoye", 10, 40],
      ["moitie", 4, 16],
    ]);
    expect(summarize(losses, true).foodKg).toBe(16);
    expect(summarize(returns, true)).toMatchObject({ events: 2, foodKg: 14, cost: { grossEur: 56 } });
    expect(losses[0]!.destinations.map((d) => d.kind)).toEqual(["compost"]);
  });

  it("la case de la zone donne les retours à part", () => {
    const { losses, returns } = splitSupplierReturns([
      fact("a", [
        ["retour_fournisseur", 4],
        ["compost", 6],
      ]),
    ]);
    const [tile] = zoneFlow([{ id: "rec", name: "Réception" }], losses, null, true, returns);
    expect(tile).toMatchObject({ kg: 6, grossEur: 24, returned: { kg: 4, grossEur: 16, events: 1 } });
  });
});

describe("devenirs selon la zone", () => {
  it("retour fournisseur seulement en Réception ; pas de réutilisation en Réception", () => {
    expect(destinationAllowedIn("retour_fournisseur", "RECEPTION")).toBe(true);
    expect(destinationAllowedIn("retour_fournisseur", "STOCKAGE")).toBe(false);
    expect(destinationAllowedIn("reutilisation", "RECEPTION")).toBe(false);
    expect(destinationAllowedIn("reutilisation", "CUISINE")).toBe(true);
    expect(destinationAllowedIn("compost", "RECEPTION")).toBe(true);
  });

  it("« Autre destination » demande un commentaire", () => {
    expect(commentRequiredFor(["compost", "autre"])).toBe(true);
    expect(commentRequiredFor(["compost"])).toBe(false);
  });
});
