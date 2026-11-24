import { describe, expect, it } from "vitest";
import {
  countUnitLabel,
  gastroTareAllowed,
  isLooseByKg,
  methodLabel,
  methodsFor,
  packagingKg,
  pieceKgFromName,
  unitsFor,
} from "@/domain/saisie-mesure";
import { INPUT_METHODS } from "@/modules/declarations/input";

const ctx = (zoneCode: string, over: Partial<Parameters<typeof unitsFor>[1]> = {}) => ({
  zoneCode,
  isConsumable: false,
  pieceWeightKnown: false,
  hasPackaging: true,
  ...over,
});

describe("façons de mesurer selon le lieu et le produit (R25)", () => {
  it("Cuisine/production, aux 4 postes : 1. pièces, 2. pesée (gastros possibles), 3. estimation", () => {
    for (const subzoneCode of ["CUI_DEBOITAGE", "CUI_PREP_FROIDE", "CUI_CUISINE", "CUI_SALLE_BLANCHE"]) {
      const c = ctx("CUISINE", { subzoneCode });
      expect(methodsFor(INPUT_METHODS, c)).toEqual(["comptage", "pesee", "estimation_manuelle"]);
      expect(methodsFor(INPUT_METHODS, c).map((m, i) => methodLabel(m, "CUISINE", m, i))).toEqual([
        "1. Nombre de pièces",
        "2. Pesée à la balance",
        "3. Estimation",
      ]);
      expect(unitsFor("comptage", c)).toEqual(["piece"]);
      expect(gastroTareAllowed(c)).toBe(true);
    }
    expect(methodsFor(INPUT_METHODS, ctx("CUISINE", { isConsumable: true }))).toEqual(["comptage"]);
  });

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
    // Ailleurs qu'en Réception et en Stockage, rien ne change.
    expect(unitsFor("pesee", ctx("CUISINE"))).toEqual(["kg", "g"]);
    expect(methodLabel("pesee", "PLONGE", "Pesée", 0)).toBe("Pesée");
  });

  it("Stockage : les mêmes façons de mesurer qu'en Réception (décision du 19/11/2026)", () => {
    expect(methodsFor(INPUT_METHODS, ctx("STOCKAGE"))).toEqual(["comptage", "pesee", "estimation_manuelle"]);
    expect(methodsFor(INPUT_METHODS, ctx("STOCKAGE")).map((m, i) => methodLabel(m, "STOCKAGE", m, i))).toEqual([
      "1. Comptage en nombre de colis, sachets ou unités",
      "2. Pesée à la balance",
      "3. Estimation",
    ]);
    expect(unitsFor("pesee", ctx("STOCKAGE"))).toEqual(["kg"]);
    expect(unitsFor("estimation_manuelle", ctx("STOCKAGE"))).toEqual(["kg", "l", "colis"]);
    expect(unitsFor("estimation_manuelle", ctx("STOCKAGE", { pieceWeightKnown: true }))).toEqual([
      "kg",
      "l",
      "piece",
      "colis",
    ]);
  });

  it("Déboîtage : gastros et pièces, ni colis ni barquettes", () => {
    const deboitage = ctx("CUISINE", { subzoneCode: "CUI_DEBOITAGE" });
    expect(unitsFor("estimation_manuelle", deboitage)).toEqual(["kg", "g", "l", "ml", "piece", "contenant", "gastro"]);
    expect(gastroTareAllowed(deboitage)).toBe(true);
    expect(unitsFor("comptage", ctx("PLONGE"))).toEqual(["piece"]);
    expect(methodsFor(INPUT_METHODS, ctx("PLONGE"))).not.toContain("estimation_contenant");
  });

  it("salle des cartons : comme en Réception, en barquettes (plat) ou en encas, kg seulement, sans gastros", () => {
    const plat = ctx("CONDITIONNEMENT", { subzoneCode: "CON_BARQUETTES", pieceWeightKnown: true });
    expect(methodsFor(INPUT_METHODS, plat)).toEqual(["comptage", "pesee", "estimation_manuelle"]);
    expect(methodsFor(INPUT_METHODS, plat).map((m, i) => methodLabel(m, "CONDITIONNEMENT", m, i, plat))).toEqual([
      "1. Nombre de barquettes",
      "2. Pesée à la balance",
      "3. Estimation",
    ]);
    expect(unitsFor("comptage", plat)).toEqual(["barquette"]);
    expect(unitsFor("pesee", plat)).toEqual(["kg"]);
    expect(unitsFor("estimation_manuelle", plat)).toEqual(["kg", "barquette"]);
    expect(gastroTareAllowed(plat)).toBe(false);

    const encas = ctx("CONDITIONNEMENT", { subzoneCode: "CON_AUTRES", isSnack: true, pieceWeightKnown: true });
    expect(methodLabel("comptage", "CONDITIONNEMENT", "comptage", 0, encas)).toBe("1. Nombre d'encas");
    expect(unitsFor("comptage", encas)).toEqual(["piece"]);
    expect(unitsFor("estimation_manuelle", encas)).toEqual(["kg", "piece"]);
    expect(countUnitLabel("piece", encas)).toBe("encas");
    expect(countUnitLabel("piece", plat)).toBeNull();

    // Poids inconnu : pas de comptage (jamais une perte à 0 kg), pesée et estimation en kg.
    const sansPoids = ctx("CONDITIONNEMENT", { isSnack: true });
    expect(methodsFor(INPUT_METHODS, sansPoids)).toEqual(["pesee", "estimation_manuelle"]);
    expect(unitsFor("estimation_manuelle", sansPoids)).toEqual(["kg"]);
    // Un consommable reste compté en pièces.
    expect(unitsFor("comptage", ctx("CONDITIONNEMENT", { isConsumable: true }))).toEqual(["piece"]);
  });

  it("consommable : toujours en pièces, jamais en colis ni en litres", () => {
    expect(unitsFor("comptage", ctx("RECEPTION", { isConsumable: true }))).toEqual(["piece"]);
    expect(unitsFor("estimation_manuelle", ctx("STOCKAGE", { isConsumable: true }))).toEqual(["kg", "piece"]);
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
  });

  it("poids écrits dans le contenu, le colis imbriqué ou le nom (décision du 19/11/2026)", () => {
    const liquid = { unitWeightKg: null, densityKgPerL: 1.03 };
    // Sous-colis pesés.
    expect(packagingKg({ packagingLabel: "Carton 10 kg", contentQuantity: 4, contentUnit: "Sac 2,5kg" }, product)).toBe(
      10,
    );
    expect(
      packagingKg(
        { packagingLabel: "sachet ( 12 pièce )", contentQuantity: 12, contentUnit: "pièces de 125 gr" },
        product,
      ),
    ).toBe(1.5);
    expect(packagingKg({ packagingLabel: "Carton 12l", contentQuantity: 4, contentUnit: "poche 3l" }, liquid)).toBe(
      12.36,
    );
    expect(
      packagingKg({ packagingLabel: "Carton 12l", contentQuantity: 4, contentUnit: "poche 3l" }, product),
    ).toBeNull();
    // L'intitulé dit un autre poids que le contenu : rien n'est retenu.
    expect(
      packagingKg({ packagingLabel: "Carton de 5kg", contentQuantity: 4, contentUnit: "Sac 2.5 kg" }, product),
    ).toBeNull();
    // Colis imbriqué dans l'intitulé, sans contenu.
    expect(
      packagingKg(
        { packagingLabel: "Palette (80.00 Carton (10KG))", contentQuantity: null, contentUnit: null },
        product,
      ),
    ).toBe(800);
    // Pièces : poids écrit dans le nom du produit.
    expect(
      packagingKg(
        { packagingLabel: "Barquette", contentQuantity: 20, contentUnit: "saucisse" },
        { ...product, name: "saucisse de volaille 60G" },
      ),
    ).toBe(1.2);
    // Rien d'écrit : à compléter sur la fiche produit.
    expect(packagingKg({ packagingLabel: "Carton", contentQuantity: 10, contentUnit: "Sachet" }, product)).toBeNull();
  });

  it("poids d'une pièce lu dans le nom : le dernier en masse, jamais une fourchette ni un pourcentage", () => {
    expect(pieceKgFromName("Escalope de dinde 120g")).toBe(0.12);
    expect(pieceKgFromName("Carré de seitan pomme de terre , oignon , fromage BIO 100gr")).toBe(0.1);
    expect(pieceKgFromName("Haut de cuisse poulet 140/160G")).toBeNull();
    expect(pieceKgFromName("crème liquide 35% MG")).toBeNull();
    expect(pieceKgFromName("sauce soja 1L")).toBeNull();
  });

  it("« (KG) » est un produit vendu au kg, pas un colis", () => {
    expect(isLooseByKg({ packagingLabel: "(KG)", contentQuantity: 1, contentUnit: "kg" })).toBe(true);
    expect(packagingKg({ packagingLabel: "(KG)", contentQuantity: 1, contentUnit: "kg" }, product)).toBeNull();
  });
});
