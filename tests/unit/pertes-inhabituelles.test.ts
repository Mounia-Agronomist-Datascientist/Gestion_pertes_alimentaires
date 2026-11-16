import { describe, expect, it } from "vitest";
import { checkUnusual, DEFAULT_ALERT_SETTINGS, type UnitWeek } from "@/domain/pertes-inhabituelles";

const w = (kg: number, produced: number | null = null, active = true): UnitWeek => ({ kg, produced, active });
const settings = DEFAULT_ALERT_SETTINGS;

describe("pertes inhabituelles", () => {
  it("compare à volume égal quand la production est connue", () => {
    // 20 kg pour 10 000 barquettes = 2 kg/1 000 ; référence 1 kg/1 000 → +100 %.
    expect(checkUnusual(w(20, 10_000), [w(10, 10_000), w(8, 8_000), w(12, 12_000), w(5, 5_000)], settings)).toEqual({
      measure: "kg_1000",
      value: 2,
      reference: 1,
      rate: 1,
      referenceWeeks: 4,
    });
    // Plus de kg mais autant par barquette produite : pas d'alerte.
    expect(checkUnusual(w(20, 20_000), [w(10, 10_000), w(10, 10_000)], settings)).toBeNull();
  });

  it("compare en kg quand la production manque", () => {
    expect(checkUnusual(w(15), [w(10), w(10), w(10), w(10)], settings)).toEqual({ measure: "kg", value: 15, reference: 10, rate: 0.5, referenceWeeks: 4 });
    expect(checkUnusual(w(14.9), [w(10), w(10)], settings)).toBeNull();
    // Production connue cette semaine mais pas assez de semaines de référence avec production : en kg.
    expect(checkUnusual(w(15, 10_000), [w(10, 10_000), w(10), w(10)], settings)).toMatchObject({ measure: "kg", referenceWeeks: 3 });
  });

  it("n'alerte pas sous 5 kg ni sans 2 semaines de référence concernées", () => {
    expect(checkUnusual(w(4.9), [w(1), w(1), w(1), w(1)], settings)).toBeNull();
    expect(checkUnusual(w(30), [w(10), w(10, null, false), w(10, null, false)], settings)).toBeNull();
    // Seules les 4 dernières semaines comptent.
    expect(checkUnusual(w(30), [w(100), w(10), w(10), w(10), w(10)], settings)).toMatchObject({ reference: 10 });
  });

  it("signale une hausse depuis zéro sans pourcentage", () => {
    expect(checkUnusual(w(6), [w(0), w(0)], settings)).toEqual({ measure: "kg", value: 6, reference: 0, rate: null, referenceWeeks: 2 });
  });
});
