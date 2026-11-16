import { describe, expect, it } from "vitest";
import { movingAverage, trendOf } from "@/domain/tendances";

describe("tendances", () => {
  it("moyenne glissante sur 4 semaines, valeurs inconnues ignorées", () => {
    expect(movingAverage([10, 20, 30, 40, 50, null, null, null])).toEqual([null, null, null, 25, 35, 40, 45, null]);
  });

  it("hausse, baisse ou stable selon l'écart des deux fenêtres de 4 semaines", () => {
    expect(trendOf([10, 10, 10, 10, 12, 12, 12, 12])).toEqual({ recent: 12, previous: 10, rate: 0.2, direction: "hausse" });
    expect(trendOf([10, 10, 10, 10, 8, 8, 8, 8])).toEqual({ recent: 8, previous: 10, rate: -0.2, direction: "baisse" });
    expect(trendOf([10, 10, 10, 10, 10.9, 10.9, 10.9, 10.9])).toMatchObject({ direction: "stable", rate: 0.09 });
    // Seuil réglable.
    expect(trendOf([10, 10, 10, 10, 10.9, 10.9, 10.9, 10.9], 0.05).direction).toBe("hausse");
  });

  it("ne conclut pas sans assez de semaines connues", () => {
    expect(trendOf([10, 10, 10, 12]).direction).toBeNull();
    expect(trendOf([null, null, null, 10, 12, 12, 12, 12])).toMatchObject({ previous: null, direction: null });
    expect(trendOf([0, 0, 0, 0, 0, 0, 0, 0])).toMatchObject({ rate: null, direction: "stable" });
    expect(trendOf([0, 0, 0, 0, 5, 0, 0, 0])).toMatchObject({ recent: 1.25, rate: null, direction: "hausse" });
  });
});
