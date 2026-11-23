import { describe, expect, it } from "vitest";
import { formatDlc, LotError, lotLabel, lotsAllowedIn, parseDlc, validateLots } from "@/domain/lots";

describe("lots et DLC (règle R37)", () => {
  const today = "2026-11-23";

  it("lit une DLC tapée au clavier numérique", () => {
    expect(parseDlc("25/11/26", today)).toBe("2026-11-25");
    expect(parseDlc("25/11/2026", today)).toBe("2026-11-25");
    expect(parseDlc("251126", today)).toBe("2026-11-25");
    expect(parseDlc("25112026", today)).toBe("2026-11-25");
    expect(parseDlc("5.1.27", today)).toBe("2027-01-05");
  });

  it("sans année, prend la date la plus proche d'aujourd'hui", () => {
    expect(parseDlc("27/11", today)).toBe("2026-11-27");
    expect(parseDlc("10/01", today)).toBe("2027-01-10");
    expect(parseDlc("01/10", today)).toBe("2026-10-01");
  });

  it("refuse une date qui n'existe pas", () => {
    expect(parseDlc("31/02/26", today)).toBeNull();
    expect(parseDlc("25", today)).toBeNull();
    expect(parseDlc("abc", today)).toBeNull();
  });

  it("formate et résume", () => {
    expect(formatDlc("2026-11-25")).toBe("25/11/2026");
    expect(lotLabel({ lotNumber: "A1", dlc: null })).toBe("Lot A1 · DLC non indiquée");
  });

  it("Réception et Stockage seulement", () => {
    expect(lotsAllowedIn("RECEPTION")).toBe(true);
    expect(lotsAllowedIn("STOCKAGE")).toBe(true);
    expect(lotsAllowedIn("CUISINE")).toBe(false);
  });

  it("la somme des lots fait la quantité de la perte", () => {
    const lines = [
      { lotNumber: " A1 ", dlc: "2026-11-25", quantity: 20 },
      { lotNumber: null, dlc: "2026-11-27", quantity: 20 },
      { lotNumber: "B7", dlc: null, quantity: 10 },
    ];
    expect(validateLots(50, lines)[0]!.lotNumber).toBe("A1");
    expect(() => validateLots(60, lines)).toThrow(/il reste 10 à répartir/);
    expect(() => validateLots(40, lines)).toThrow(/dépasse/);
    expect(() => validateLots(5, [{ lotNumber: " ", dlc: null, quantity: 5 }])).toThrow(LotError);
  });
});
