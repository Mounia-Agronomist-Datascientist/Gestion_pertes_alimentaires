import { describe, expect, it } from "vitest";
import { gastroTareAllowed, isLooseByKg, methodLabel, methodsFor, packagingKg, unitsFor } from "@/domain/saisie-mesure";
import { INPUT_METHODS } from "@/modules/declarations/input";

const ctx = (zoneCode: string, over: Partial<Parameters<typeof unitsFor>[1]> = {}) => ({
  zoneCode,
  isConsumable: false,
  pieceWeightKnown: false,
  hasPackaging: true,
  ...over,
});

describe("façons de mesurer selon le lieu et le produit (R25)", () => {
  it("Réception et Stockage : kg, colis ; pièces seulement avec un poids connu ; ni gastros ni barquettes", () => {
    expect(unitsFor("comptage", ctx("RECEPTION"))).toEqual(["colis"]);
    expect(unitsFor("comptage", ctx("STOCKAGE", { pieceWeightKnown: true }))).toEqual(["piece", "colis"]);
    // Sans colis connu, le colis reste proposé : son poids s'indique à la saisie.
    expect(unitsFor("comptage", ctx("RECEPTION", { hasPackaging: false }))).toEqual(["colis"]);
    expect(gastroTareAllowed(ctx("RECEPTION"))).toBe(false);
  });

  it("Réception : comptage, pesée, estimation dans cet ordre, numérotés ; ni g ni mL", () => {
    expect(methodsFor(INPUT_METHODS, ctx("RECEPTION"))).toEqual(["comptage", "pesee", "estimation_manuelle"]);
    expect(methodsFor(INPUT_METHODS, ctx("RECEPTION")).map((m, i) => methodLabel(m, "RECEPTION", m, i))).toEqual([
      "1. Comptage en nombre de colis, sachets ou unités",
      "2. Pesée à la balance",
      "3. Estimation",
    ]);
    expect(unitsFor("pesee", ctx("RECEPTION"))).toEqual(["kg"]);
    expect(unitsFor("estimation_manuelle", ctx("RECEPTION"))).toEqual(["kg", "l", "colis"]);
    // Ailleurs, rien ne change.
    expect(unitsFor("pesee", ctx("STOCKAGE"))).toEqual(["kg", "g"]);
    expect(methodLabel("pesee", "CUISINE", "Pesée", 0)).toBe("Pesée");
  });

  it("Cuisine : gastros et pièces, ni colis ni barquettes ; Conditionnement : barquettes et gastros", () => {
    expect(unitsFor("comptage", ctx("CUISINE"))).toEqual(["piece", "contenant"]);
    expect(unitsFor("estimation_contenant", ctx("CUISINE"))).toEqual(["gastro", "contenant"]);
    expect(gastroTareAllowed(ctx("CUISINE"))).toBe(true);
    expect(unitsFor("comptage", ctx("CONDITIONNEMENT"))).toEqual(["piece", "barquette", "contenant"]);
    expect(unitsFor("comptage", ctx("PLONGE"))).toEqual(["piece"]);
    expect(methodsFor(INPUT_METHODS, ctx("PLONGE"))).not.toContain("estimation_contenant");
  });

  it("consommable : toujours en pièces, jamais en colis ni en litres", () => {
    expect(unitsFor("comptage", ctx("RECEPTION", { isConsumable: true }))).toEqual(["piece"]);
    expect(unitsFor("estimation_manuelle", ctx("STOCKAGE", { isConsumable: true }))).toEqual(["kg", "g", "piece"]);
  });
});

describe("poids d'un colis", () => {
  const product = { unitWeightKg: null, densityKgPerL: null };
  it("masse, volume avec densité, pièces avec poids ; jamais deviné", () => {
    expect(packagingKg({ packagingLabel: "Sachet 5kg", contentQuantity: 5, contentUnit: "kg" }, product)).toBe(5);
    expect(packagingKg({ packagingLabel: "Boite 500g", contentQuantity: 500, contentUnit: "g" }, product)).toBe(0.5);
    expect(
      packagingKg({ packagingLabel: "Bouteille 64cl", contentQuantity: 64, contentUnit: "cL" }, product),
    ).toBeNull();
    expect(
      packagingKg(
        { packagingLabel: "Bouteille 64cl", contentQuantity: 64, contentUnit: "cL" },
        { unitWeightKg: null, densityKgPerL: 0.92 },
      ),
    ).toBe(0.5888);
    expect(
      packagingKg({ packagingLabel: "Barquette", contentQuantity: 20, contentUnit: "Merguez" }, product),
    ).toBeNull();
    expect(
      packagingKg(
        { packagingLabel: "Barquette", contentQuantity: 20, contentUnit: "Merguez" },
        { unitWeightKg: 0.07, densityKgPerL: null },
      ),
    ).toBe(1.4);
    expect(
      packagingKg(
        { packagingLabel: "Carton 12l", contentQuantity: 4, contentUnit: "poche 3l" },
        { unitWeightKg: 1, densityKgPerL: 1 },
      ),
    ).toBeNull();
  });

  it("« (KG) » est un produit vendu au kg, pas un colis", () => {
    expect(isLooseByKg({ packagingLabel: "(KG)", contentQuantity: 1, contentUnit: "kg" })).toBe(true);
    expect(packagingKg({ packagingLabel: "(KG)", contentQuantity: 1, contentUnit: "kg" }, product)).toBeNull();
  });
});
