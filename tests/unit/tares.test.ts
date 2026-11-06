import { describe, expect, it } from "vitest";
import { computeNetWeight, TareError, type GastroLine } from "@/domain/tares";

// Valeurs du fichier « Multiplication des gastros » (novembre 2026).
const gastroFin: Omit<GastroLine, "count"> = { containerTypeId: "G1", tareId: "t-G1", unitTareKg: 1.1, maxCount: 40 };
const gastroProfond: Omit<GastroLine, "count"> = { containerTypeId: "G4", tareId: "t-G4", unitTareKg: 2.25, maxCount: 30 };
const echelleClassique = { containerTypeId: "ECH", tareId: "t-ECH", unitTareKg: 21 };

describe("calcul du poids net avec tares de gastros", () => {
  it("un type de gastro : 3 gastros fins = 3,3 kg de tare", () => {
    const r = computeNetWeight({ grossKg: 15, gastros: [{ ...gastroFin, count: 3 }] });
    expect(r.tareTotalKg).toBe(3.3);
    expect(r.netKg).toBe(11.7);
  });

  it("concorde avec le tableau de référence (40 gastros fins = 44 kg ; 30 profonds = 67,5 kg)", () => {
    expect(computeNetWeight({ grossKg: 100, gastros: [{ ...gastroFin, count: 40 }] }).tareTotalKg).toBe(44);
    expect(computeNetWeight({ grossKg: 100, gastros: [{ ...gastroProfond, count: 30 }] }).tareTotalKg).toBe(67.5);
  });

  it("plusieurs types de gastros sont additionnés séparément", () => {
    const r = computeNetWeight({
      grossKg: 20,
      gastros: [
        { ...gastroFin, count: 2 },
        { ...gastroProfond, count: 2 },
      ],
    });
    expect(r.lines.map((l) => l.tareKg)).toEqual([2.2, 4.5]);
    expect(r.tareTotalKg).toBe(6.7);
    expect(r.netKg).toBe(13.3);
  });

  it("déduit l'échelle lorsqu'elle est pesée avec les gastros", () => {
    const r = computeNetWeight({ grossKg: 60, gastros: [{ ...gastroFin, count: 10 }], support: echelleClassique });
    expect(r.tareTotalKg).toBe(32);
    expect(r.netKg).toBe(28);
    expect(r.lines.at(-1)).toMatchObject({ tareId: "t-ECH", count: 1, tareKg: 21 });
  });

  it("conserve l'identifiant de version de chaque tare utilisée", () => {
    const r = computeNetWeight({ grossKg: 10, gastros: [{ ...gastroFin, count: 1 }] });
    expect(r.lines[0]?.tareId).toBe("t-G1");
  });

  it("refuse un poids brut inférieur ou égal à la tare", () => {
    expect(() => computeNetWeight({ grossKg: 3.3, gastros: [{ ...gastroFin, count: 3 }] })).toThrow(TareError);
    expect(() => computeNetWeight({ grossKg: 2, gastros: [{ ...gastroFin, count: 3 }] })).toThrow(/supérieur à la tare/);
  });

  it("refuse un nombre de gastros non entier, nul ou au-delà de la capacité de l'échelle", () => {
    expect(() => computeNetWeight({ grossKg: 50, gastros: [{ ...gastroFin, count: 1.5 }] })).toThrow(/entier/);
    expect(() => computeNetWeight({ grossKg: 50, gastros: [{ ...gastroFin, count: 0 }] })).toThrow(/entier/);
    expect(() => computeNetWeight({ grossKg: 500, gastros: [{ ...gastroFin, count: 41 }] })).toThrow(/Au plus 40/);
  });

  it("refuse un poids brut nul ou une pesée sans contenant", () => {
    expect(() => computeNetWeight({ grossKg: 0, gastros: [{ ...gastroFin, count: 1 }] })).toThrow(/brut/);
    expect(() => computeNetWeight({ grossKg: 10, gastros: [] })).toThrow(/au moins un/);
  });

  it("refuse deux lignes du même type", () => {
    expect(() =>
      computeNetWeight({ grossKg: 50, gastros: [{ ...gastroFin, count: 1 }, { ...gastroFin, count: 2 }] }),
    ).toThrow(/qu'une fois/);
  });
});
