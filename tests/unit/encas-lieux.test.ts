import { describe, expect, it } from "vitest";
import { snackAllowedIn } from "@/domain/encas";

describe("encas proposés là où ils sont rangés au Stockage (décision du 23/11/2026)", () => {
  it("frais : yaourts et fromages ; sec : les autres ; ailleurs au Stockage : aucun", () => {
    expect(snackAllowedIn("STOCKAGE", "STO_ENCAS_FRAIS", "Yaourts")).toBe(true);
    expect(snackAllowedIn("STOCKAGE", "STO_ENCAS_FRAIS", "fromages")).toBe(true);
    expect(snackAllowedIn("STOCKAGE", "STO_ENCAS_FRAIS", "Crackers")).toBe(false);
    expect(snackAllowedIn("STOCKAGE", "STO_SEC_ENCAS", "Crackers")).toBe(true);
    expect(snackAllowedIn("STOCKAGE", "STO_SEC_ENCAS", "Yaourts")).toBe(false);
    expect(snackAllowedIn("STOCKAGE", "STO_BOF", "Yaourts")).toBe(false);
  });

  it("sans famille : dans les deux lieux d'encas ; Réception et Conditionnement : tous", () => {
    expect(snackAllowedIn("STOCKAGE", "STO_ENCAS_FRAIS", null)).toBe(true);
    expect(snackAllowedIn("STOCKAGE", "STO_SEC_ENCAS", null)).toBe(true);
    expect(snackAllowedIn("STOCKAGE", "STO_NEGATIVE", null)).toBe(false);
    expect(snackAllowedIn("RECEPTION", "REC_RECEPTION", "Yaourts")).toBe(true);
    expect(snackAllowedIn("CONDITIONNEMENT", "CON_AUTRES", "Crackers")).toBe(true);
  });
});
