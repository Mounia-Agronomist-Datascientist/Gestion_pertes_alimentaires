import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";
import { parseTome } from "@/modules/imports/tome/parse-tome";

/** Extrait du tome S48 (pages 1, 24, 25, 27 à 30, 86, 87 ; tableaux seulement, sans commentaires). */
const items = (
  JSON.parse(readFileSync("tests/fixtures/s48/tome-S48-extrait.items.json", "utf8")) as [
    number,
    number,
    number,
    number,
    number,
    string,
  ][]
).map(([page, x, y, width, size, text]): PdfItem => ({ page, x, y, width, size, text }));

describe("tome imprimé pour la production avec deux colonnes de quantité (S48)", () => {
  const r = parseTome(items);

  it("lit la colonne du lot et ramène quantités et coûts à une portion", () => {
    const ca01 = r.recipes.find((x) => x.code === "CA01")!;
    expect(ca01).toMatchObject({ week: 48, recipeCount: 832, portionWeightG: 370.3 });
    expect(ca01.lines.map((l) => [l.label, l.quantity, l.unit, l.cost])).toEqual([
      ["Viande: Boulette de volaille (sous-recette)", 3, "recette(s) (23.1 g)", 0.3546],
      ["Féculent: riz long étuvé de Camargue (sous-recette)", 121, "g", 0.1754],
      ["Légume vapeur: Brocolis ROK (sous-recette)", 80, "g", 0.22],
      ["Sauce: creme miel citron ciboulette light ***A MIXER*** (sous recette)", 80, "g", 0.3064],
      ["Crème à ajouter à la sauce (sous recette)", 20, "g", 0.097],
    ]);
    expect(ca01.total).toEqual({ quantity: 0.3703, unit: "kg", cost: 1.1534 });
  });

  it("ignore les en-têtes coupés en deux lignes et recolle un nom coupé par un saut de page", () => {
    expect(r.anomalies.filter((a) => /non reconnue/.test(a.message))).toEqual([]);
    const po02 = r.recipes.find((x) => x.code === "PO02")!;
    expect(po02.lines.map((l) => l.label)).toEqual([
      "Poisson: Filet de limande cuisson four 120°C sec - 75°C à coeur (sous-recette)",
      "Féculent: boulgour ROK (sous recette)",
      "Légume rôti: butternut et carotte (sous recette)",
      "Sauce: beurre blanc -creme beurre vin échalotte FB (sous-recette)",
    ]);
    // Avant : « 120°C sec - 75°C à coeur (sous-recette) Féculent: boulgour ROK (sous recette) », nom inconnu.
    expect(r.anomalies.filter((a) => /°C à coeur \(sous-recette\) Féculent/.test(a.message))).toEqual([]);
  });

  it("une sous-recette imprimée pour deux tailles de lot n'est pas signalée comme différente", () => {
    expect(r.anomalies.filter((a) => /Boulette de volaille|Lasagne de porc/.test(a.message))).toEqual([]);
    const sub = r.subRecipes.find((x) => x.key === "viande boulette de volaille")!;
    expect(sub.reference).toEqual({ quantity: 2496, unit: "recette(s) (23.1 g)" });
  });
});
