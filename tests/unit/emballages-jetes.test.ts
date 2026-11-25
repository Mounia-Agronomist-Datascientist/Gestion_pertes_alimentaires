import { describe, expect, it } from "vitest";
import {
  discardedPackagingPerPortion,
  missingPackagingAnswer,
  mouldLinesOf,
  packagingQuestionsFor,
} from "@/domain/couts";

const isMould = (l: string) => /^\s*moules?\b/i.test(l) || /\bplats? à gratin\b/i.test(l);
const moulds = [{ label: "Plat à gratin - petit format", eur: 0.068 }];

describe("moule et barquette jetés avec le plat (R42)", () => {
  it("moules du tome, sous-recettes comprises au prorata, regroupés par libellé", () => {
    const subRecipes = new Map([
      ["sr", { totalCostEur: 30, lines: [{ label: "Petit plat à gratin", costEur: 30, subRecipeId: null }] }],
    ]);
    const lines = [
      { label: "Riz", costEur: 0.5, subRecipeId: null },
      { label: "Plat à gratin -petit format (sous recette)", costEur: 0.068, subRecipeId: null },
      { label: "Gratin (sous-recette)", costEur: 0.06, subRecipeId: "sr" },
    ];
    expect(mouldLinesOf(lines, subRecipes, isMould)).toEqual([
      { label: "Petit plat à gratin", eur: 0.06 },
      { label: "Plat à gratin -petit format", eur: 0.068 },
    ]);
  });

  it("questions seulement pour un plat entier, en salle blanche et en salle des cartons", () => {
    const dish = { wholeDish: true, moulds };
    expect(packagingQuestionsFor({ zoneCode: "CUISINE", subzoneCode: "CUI_CUISINE" }, dish)).toEqual({
      moulds: [],
      tray: false,
    });
    expect(packagingQuestionsFor({ zoneCode: "CUISINE", subzoneCode: "CUI_SALLE_BLANCHE" }, dish)).toEqual({
      moulds,
      tray: true,
    });
    expect(packagingQuestionsFor({ zoneCode: "CONDITIONNEMENT", subzoneCode: "CON_BARQUETTES" }, dish).tray).toBe(true);
    expect(
      packagingQuestionsFor(
        { zoneCode: "CONDITIONNEMENT", subzoneCode: "CON_BARQUETTES" },
        { ...dish, wholeDish: false },
      ),
    ).toEqual({ moulds: [], tray: false });
  });

  it("réponses obligatoires ; total = moules choisis + barquette", () => {
    const q = { moulds, tray: true };
    expect(missingPackagingAnswer(q, {})).toMatch(/moule/);
    expect(missingPackagingAnswer(q, { moulds: [] })).toMatch(/barquette/);
    expect(missingPackagingAnswer(q, { moulds: [], tray: false })).toBeNull();
    expect(discardedPackagingPerPortion(q, { moulds: [moulds[0]!.label], tray: true }, 0.15)).toBe(0.218);
    expect(discardedPackagingPerPortion(q, { moulds: [], tray: false }, 0.15)).toBe(0);
    expect(discardedPackagingPerPortion({ moulds: [], tray: false }, {}, 0.15)).toBeNull();
  });
});
