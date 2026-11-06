import { describe, expect, it } from "vitest";
import {
  checkDestinationSplit,
  DestinationError,
  validateDestinationSplit,
} from "@/domain/destinations";

describe("répartition entre destinations", () => {
  it("une seule destination reçoit 100 %", () => {
    expect(checkDestinationSplit(12.5, [{ destinationId: "compost", quantity: 12.5 }])).toEqual({
      status: "ok",
      allocated: 12.5,
      remaining: 0,
    });
  });

  it("exemple du cahier des charges : 20 kg = 5 don + 8 vente flash + 4 réutilisés + 3 compostés", () => {
    const r = checkDestinationSplit(20, [
      { destinationId: "don", quantity: 5 },
      { destinationId: "vente_flash", quantity: 8 },
      { destinationId: "reutilisation", quantity: 4 },
      { destinationId: "compost", quantity: 3 },
    ]);
    expect(r.status).toBe("ok");
  });

  it("tolère les écarts d'arrondi (0,1 + 0,2 = 0,3)", () => {
    const r = checkDestinationSplit(0.3, [
      { destinationId: "a", quantity: 0.1 },
      { destinationId: "b", quantity: 0.2 },
    ]);
    expect(r.status).toBe("ok");
  });

  it("signale le reste à affecter", () => {
    const r = checkDestinationSplit(20, [{ destinationId: "don", quantity: 17 }]);
    expect(r).toEqual({ status: "ecart", allocated: 17, remaining: 3 });
  });

  it("signale un excédent affecté", () => {
    expect(checkDestinationSplit(10, [{ destinationId: "don", quantity: 12 }]).remaining).toBe(-2);
  });

  it("un écart exige une justification", () => {
    const lines = [{ destinationId: "don", quantity: 17 }];
    expect(() => validateDestinationSplit(20, lines)).toThrow(/il reste 3 à affecter/);
    expect(() => validateDestinationSplit(20, lines, "   ")).toThrow(DestinationError);
    expect(validateDestinationSplit(20, lines, " 3 kg jetés par erreur ").justification).toBe("3 kg jetés par erreur");
  });

  it("une répartition exacte ne conserve pas de justification", () => {
    expect(validateDestinationSplit(5, [{ destinationId: "don", quantity: 5 }], "inutile").justification).toBeNull();
  });

  it("refuse une liste vide, des doublons ou des quantités nulles", () => {
    expect(() => checkDestinationSplit(5, [])).toThrow(/au moins une/);
    expect(() =>
      checkDestinationSplit(5, [
        { destinationId: "don", quantity: 2 },
        { destinationId: "don", quantity: 3 },
      ]),
    ).toThrow(/qu'une fois/);
    expect(() => checkDestinationSplit(5, [{ destinationId: "don", quantity: 0 }])).toThrow(/supérieure à 0/);
  });
});
