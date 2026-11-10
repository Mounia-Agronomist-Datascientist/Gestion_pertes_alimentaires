import { describe, expect, it } from "vitest";
import { datedChange } from "@/domain/versions-datees";

describe("valeurs datées", () => {
  const latest = { validFrom: "2026-11-01" };
  it("nouvelle version après la dernière, ou première valeur", () => {
    expect(datedChange(null, "2026-11-10", "2026-11-10")).toEqual({ kind: "nouvelle" });
    expect(datedChange(latest, "2026-12-01", "2026-11-10")).toEqual({ kind: "nouvelle" });
  });
  it("correction d'une valeur pas encore entrée en vigueur", () => {
    expect(datedChange({ validFrom: "2026-12-01" }, "2026-12-01", "2026-11-10")).toEqual({ kind: "correction" });
    expect(datedChange({ validFrom: "2026-11-10" }, "2026-11-10", "2026-11-10")).toEqual({ kind: "correction" });
  });
  it("refuse une date antérieure ou la réécriture d'une valeur appliquée", () => {
    expect(datedChange(latest, "2026-10-15", "2026-11-10")).toMatchObject({ kind: "refus", message: expect.stringMatching(/01\/11\/2026/) });
    expect(datedChange(latest, "2026-11-01", "2026-11-10")).toMatchObject({ kind: "refus", message: expect.stringMatching(/déjà appliquée/) });
  });
});
