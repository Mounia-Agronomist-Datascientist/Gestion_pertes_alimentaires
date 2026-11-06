import { describe, expect, it } from "vitest";
import { convertToKg, QuantityError, type Unit } from "@/domain/unites";

const kg: Unit = { code: "kg", kind: "masse", toBaseFactor: 1 };
const g: Unit = { code: "g", kind: "masse", toBaseFactor: 0.001 };
const l: Unit = { code: "l", kind: "volume", toBaseFactor: 1 };
const ml: Unit = { code: "ml", kind: "volume", toBaseFactor: 0.001 };
const barquette: Unit = { code: "barquette", kind: "comptage", toBaseFactor: 1 };

const food = { isConsumable: false };

describe("conversion en kilogrammes", () => {
  it("kg : immédiat, statut pesé", () => {
    expect(convertToKg(2.5, kg, food)).toEqual({ netKg: 2.5, kgStatus: "pese", factorUsed: null });
  });

  it("grammes → kilogrammes", () => {
    expect(convertToKg(750, g, food).netKg).toBe(0.75);
  });

  it("litres avec densité du produit", () => {
    const r = convertToKg(2, l, { ...food, densityKgPerL: 1.03 });
    expect(r).toMatchObject({ netKg: 2.06, kgStatus: "converti", factorUsed: 1.03 });
  });

  it("millilitres avec densité", () => {
    expect(convertToKg(500, ml, { ...food, densityKgPerL: 0.92 }).netKg).toBe(0.46);
  });

  it("litres SANS densité : jamais 1 L = 1 kg, quantité non convertie", () => {
    const r = convertToKg(2, l, food);
    expect(r.netKg).toBeNull();
    expect(r.kgStatus).toBe("non_converti");
    expect(r.reason).toMatch(/Densité inconnue/);
  });

  it("barquettes avec poids unitaire connu", () => {
    expect(convertToKg(12, barquette, { ...food, unitWeightKg: 0.35 })).toMatchObject({
      netKg: 4.2,
      kgStatus: "converti",
      factorUsed: 0.35,
    });
  });

  it("barquettes sans poids unitaire : non converti", () => {
    expect(convertToKg(12, barquette, food).kgStatus).toBe("non_converti");
  });

  it("consommables : jamais convertis en kg alimentaires", () => {
    expect(convertToKg(100, barquette, { isConsumable: true, unitWeightKg: 0.02 })).toEqual({
      netKg: null,
      kgStatus: "sans_objet",
      factorUsed: null,
    });
  });

  it("refuse une quantité nulle, négative ou invalide", () => {
    expect(() => convertToKg(0, kg, food)).toThrow(QuantityError);
    expect(() => convertToKg(-1, kg, food)).toThrow(QuantityError);
    expect(() => convertToKg(Number.NaN, kg, food)).toThrow(QuantityError);
  });
});
