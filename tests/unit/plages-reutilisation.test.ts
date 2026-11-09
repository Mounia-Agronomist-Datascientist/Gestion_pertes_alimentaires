import { describe, expect, it } from "vitest";
import { defaultProductionDays, isWindowClosed, reuseWindows } from "@/domain/plages-reutilisation";

// S46-2026 : jeudi 05/11 → mercredi 11/11.
const S46 = "2026-11-05";

describe("plages de réutilisation des surplus", () => {
  it("jours de production par défaut : jeudi, vendredi, lundi, mardi, mercredi", () => {
    expect(defaultProductionDays(S46)).toEqual(["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("une semaine normale donne deux plages : jeudi-vendredi et lundi-mercredi", () => {
    expect(reuseWindows(S46, defaultProductionDays(S46))).toEqual([
      { key: "jeudi_vendredi", firstDay: "2026-11-05", lastDay: "2026-11-06", days: ["2026-11-05", "2026-11-06"] },
      { key: "lundi_mercredi", firstDay: "2026-11-09", lastDay: "2026-11-11", days: ["2026-11-09", "2026-11-10", "2026-11-11"] },
    ]);
  });

  it("un samedi travaillé est rattaché à la plage jeudi-vendredi", () => {
    const [first] = reuseWindows(S46, ["2026-11-06", "2026-11-07", "2026-11-09"]);
    expect(first).toMatchObject({ key: "jeudi_vendredi", firstDay: "2026-11-06", lastDay: "2026-11-07" });
  });

  it("un jour férié raccourcit la plage ; une plage sans jour travaillé disparaît", () => {
    const windows = reuseWindows(S46, ["2026-11-09", "2026-11-10"]); // jeudi et vendredi non travaillés, mercredi férié
    expect(windows).toEqual([{ key: "lundi_mercredi", firstDay: "2026-11-09", lastDay: "2026-11-10", days: ["2026-11-09", "2026-11-10"] }]);
  });

  it("refuse un jour qui n'appartient pas à la semaine", () => {
    expect(() => reuseWindows(S46, ["2026-11-12"])).toThrow(/n'appartiennent pas/);
  });

  it("une plage n'est contrôlée que le lendemain de son dernier jour", () => {
    const window = { lastDay: "2026-11-06" };
    expect(isWindowClosed(window, "2026-11-06")).toBe(false);
    expect(isWindowClosed(window, "2026-11-07")).toBe(true);
  });
});

describe("jours sans saisie", () => {
  it("liste les jours de la plage sans déclaration", async () => {
    const { missingDays } = await import("@/domain/plages-reutilisation");
    const window = { days: ["2026-11-09", "2026-11-10", "2026-11-11"] };
    expect(missingDays(window, ["2026-11-10"])).toEqual(["2026-11-09", "2026-11-11"]);
    expect(missingDays(window, window.days)).toEqual([]);
  });
});
