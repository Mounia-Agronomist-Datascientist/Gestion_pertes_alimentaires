import { describe, expect, it } from "vitest";
import { buildWeekImport, isSnackCode } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";

describe("rapprochement du tome et du plan S45", () => {
  const tome = parseTome(s45TomeItems());
  const preview = buildWeekImport(tome, parsePlan("S45", s45PlanGrid()));

  it("associe chaque plat du plan à son équipe et à ses barquettes", () => {
    expect(preview).toMatchObject({ year: 2026, week: 45, errors: [] });
    expect(preview.recipes.find((r) => r.code === "VI01")).toMatchObject({
      team: "D",
      planGroup: "VI01/QD01/FB04",
      planBlock: "plats",
      weekBarquettes: 2953,
      firstDayBarquettes: 605,
    });
    expect(preview.recipes.find((r) => r.code === "PJ12")).toMatchObject({ team: "G", planBlock: "petits_dejeuners" });
    expect(preview.recipes.filter((r) => r.team)).toHaveLength(60);
  });

  it("les encas (EN…), absents du plan, ne sont pas une anomalie ; un plat sans équipe l'est", () => {
    expect(preview.recipes.filter((r) => isSnackCode(r.code))).toHaveLength(22);
    expect(preview.warnings).toEqual([]);
    const grid = s45PlanGrid().map((row) => (row[0] === "VG02" ? row.map((v, i) => (i === 15 ? "" : v)) : row));
    expect(buildWeekImport(tome, parsePlan("S45", grid)).warnings).toContain("Recettes du tome sans équipe dans le plan (non proposées aux équipes) : VG02");
  });

  it("bloque un tome et un onglet de semaines différentes, ou un tome vide", () => {
    expect(buildWeekImport(tome, parsePlan("S46", s45PlanGrid())).errors).toEqual([
      "Le tome est celui de la semaine 45, l'onglet du plan celui de la semaine 46",
    ]);
    expect(buildWeekImport({ recipes: [], subRecipes: [], anomalies: [] }, parsePlan("S45", s45PlanGrid())).errors[0]).toMatch(/Aucune recette/);
  });
});
