import { describe, expect, it } from "vitest";
import { REFERENCE_DENSITIES, referenceDensity, referenceDensityLabel } from "@/domain/densites";

const d = (name: string) => referenceDensity(name);

describe("densités de référence des liquides", () => {
  it("retient le milieu de chaque plage", () => {
    expect(REFERENCE_DENSITIES["huile de sésame"]).toBe(0.92);
    expect(REFERENCE_DENSITIES["huile d'olive"]).toBe(0.913);
    expect(REFERENCE_DENSITIES["sauce soja"]).toBe(1.15);
    expect(REFERENCE_DENSITIES["lait entier"]).toBe(1.031);
    expect(REFERENCE_DENSITIES.eau).toBe(0.998);
  });

  it("rattache les libellés Melba du tableau", () => {
    expect(d("huile de sésame")).toEqual({ densityKgPerL: 0.92, liquids: ["huile de sésame"], approximate: false });
    expect(d("Huile d'olive extra vierge")?.densityKgPerL).toBe(0.913);
    expect(d("huile de tournesol 5L")?.densityKgPerL).toBe(0.9205);
    expect(d("Lait entier 🔴")?.liquids).toEqual(["lait entier"]);
    expect(d("crème liquide 35% MG UHT")?.liquids).toEqual(["crème liquide"]);
    expect(d("pur jus d'orange")?.liquids).toEqual(["jus d'orange"]);
    expect(d("vinaigre blanc vici épisaveurs 🟢")).toMatchObject({ liquids: ["vinaigre blanc"], approximate: false });
    expect(d("sauce soja salée kikkoman Bidon 5L")).toMatchObject({ densityKgPerL: 1.15, approximate: false });
    expect(d("miel liquide")?.liquids).toEqual(["miel liquide"]);
  });

  it("et les plus proches (décision du 18/11/2026)", () => {
    const blend = d("huile olive colza")!;
    expect(blend).toMatchObject({ liquids: ["huile d'olive", "huile de colza"], approximate: true, densityKgPerL: 0.914 });
    expect(referenceDensityLabel(blend)).toBe("huile d'olive + huile de colza, moyenne");
    expect(d("Lait demi-écrémé 🔵")).toMatchObject({ densityKgPerL: 1.033, approximate: true });
    expect(d("sauce soja sucrée kikkoman")).toMatchObject({ densityKgPerL: 1.15, approximate: true });
    expect(referenceDensityLabel(d("Vinaigre de vin")!)).toBe("vinaigre blanc, au plus proche");
  });

  it("aucune densité devinée pour le reste", () => {
    for (const name of ["Lait de coco thai kitchen poche", "jus de citron jaune bio", "jus de cuisson légumes", "crème fraiche épaisse 30%", "Rösti aux oignons à l'huile de tournesol", "Beurre de cacahuètes sans huile de palme", "Pêche oreillon au sirop léger", "Bûche de chèvre au lait français 🟢"]) {
      expect(d(name), name).toBeNull();
    }
  });
});
