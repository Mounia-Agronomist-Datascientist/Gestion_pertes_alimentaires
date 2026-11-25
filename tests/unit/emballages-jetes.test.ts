import { describe, expect, it } from "vitest";
import {
  discardedPackagingPerPortion,
  missingPackagingAnswer,
  mouldLinesOf,
  packagingQuestionsFor,
  priceMoulds,
  sameArticleName,
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
      { label: "Petit plat à gratin", eur: 0.06, pieces: null },
      { label: "Plat à gratin -petit format", eur: 0.068, pieces: null },
    ]);
  });

  it("sous-recette qui n'est qu'un moule : l'article acheté, avec le nombre de pièces par portion", () => {
    const isPot = (l: string) => isMould(l) || /^\s*pots?\s+(panna|kraft)/i.test(l);
    const subRecipes = new Map([
      [
        "pot",
        {
          totalCostEur: 31.95,
          lines: [{ label: "Pot KRAFT 100ml (grand format)", costEur: 31.95, subRecipeId: null, quantity: 702 }],
        },
      ],
    ]);
    const lines = [
      { label: "Crème", costEur: 0.4, subRecipeId: null, quantity: 80 },
      { label: "Pot panna cotta ( sous-recette )", costEur: 0.0455, subRecipeId: "pot", quantity: 1 },
      { label: "Plat à gratin (grand format)", costEur: 0.0329, subRecipeId: null, quantity: 0.125 },
    ];
    expect(mouldLinesOf(lines, subRecipes, isPot)).toEqual([
      { label: "Plat à gratin (grand format)", eur: 0.0329, pieces: 0.125 },
      { label: "Pot KRAFT 100ml (grand format)", eur: 0.0455, pieces: 1 },
    ]);
  });

  it("nom et prix des moules réglés par l'administration, sinon ceux du tome", () => {
    expect(
      sameArticleName("MOULE RECTANGULAIRE INDIV BIODEG 167mL", "MOULE RECTANGULAIRE INDIVIDUEL BIODEG 167mL"),
    ).toBe(true);
    expect(sameArticleName("Moule rond biodeg", "MOULE ROND INDIVIDUEL BIODEG 180mL")).toBe(false);
    const priced = priceMoulds(
      [
        { label: "MOULE RECTANGULAIRE INDIVIDUEL BIODEG 167mL", eur: 0.1182, pieces: 1 },
        { label: "Plat à gratin (grand format)", eur: 0.0329, pieces: 0.125 },
        { label: "Petit plat à gratin format individuel", eur: 0.068, pieces: 1 },
      ],
      [
        { name: "MOULE RECTANGULAIRE INDIV BIODEG 167mL", code: "MR167", unitCostEur: 0.13 },
        { name: "Plat à gratin grand format", code: "PG", unitCostEur: 0.4 },
        { name: "Petit plat à gratin format individuel", code: "PP", unitCostEur: null },
      ],
    );
    expect(priced).toEqual([
      { label: "MOULE RECTANGULAIRE INDIV BIODEG 167mL", eur: 0.13, pieces: 1 },
      { label: "Petit plat à gratin format individuel", eur: 0.068, pieces: 1 },
      { label: "Plat à gratin grand format", eur: 0.05, pieces: 0.125 },
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
