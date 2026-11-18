import { describe, expect, it } from "vitest";
import { zoneFlow } from "@/domain/flux-zones";
import type { LossFact } from "@/domain/statistiques";

const fact = (zoneId: string, netKg: number | null, grossEur = 0): LossFact => ({
  id: `${zoneId}-${netKg}-${grossEur}`,
  occurredOn: "2026-11-12",
  productionWeekId: "w",
  zoneId,
  subzoneId: "sz",
  teamId: null,
  category: "matiere_premiere",
  food: true,
  productKey: "p",
  productName: "p",
  productCode: null,
  weekSubRecipeId: null,
  causeId: "c",
  causeName: "c",
  netKg,
  netQuantity: netKg ?? 1,
  netUnitCode: netKg == null ? "piece" : "kg",
  cost: { materialEur: grossEur, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur, recoveredEur: 0 },
  destinations: [],
});

const zones = [
  { id: "REC", name: "Réception" },
  { id: "STO", name: "Stockage" },
  { id: "CUI", name: "Cuisine" },
];

describe("cases par zone (marche en avant)", () => {
  it("garde l'ordre des zones ; jauge = part des kg ; évolution des kg", () => {
    const tiles = zoneFlow(
      zones,
      [fact("REC", 5, 10), fact("CUI", 15, 30), fact("STO", null)],
      [fact("CUI", 10), fact("STO", 4)],
      true,
    );
    expect(tiles.map((t) => [t.name, t.kg, t.share, t.grossEur])).toEqual([
      ["Réception", 5, 0.25, 10],
      ["Stockage", 0, 0, 0],
      ["Cuisine", 15, 0.75, 30],
    ]);
    expect(tiles.map((t) => t.change)).toEqual([null, -1, 0.5]);
    expect(tiles[0]).toMatchObject({ previousKg: 0, events: 1 });
    expect(tiles[1]).toMatchObject({ notConverted: 1, events: 1 });
  });

  it("sans euros visibles ni période précédente", () => {
    const tiles = zoneFlow(zones, [], null, false);
    expect(tiles.every((t) => t.grossEur === null && t.previousKg === null && t.change === null && t.share === 0)).toBe(
      true,
    );
  });
});
