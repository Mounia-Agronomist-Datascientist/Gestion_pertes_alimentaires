import { describe, expect, it } from "vitest";
import { buildWeekImport, isMouldLabel, isSnackCode } from "@/modules/imports/merge";
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
    expect(buildWeekImport(tome, parsePlan("S45", grid)).warnings).toContain(
      "Recettes du tome sans équipe dans le plan (non proposées aux équipes) : VG02",
    );
  });

  it("composition des plats non lue : refusée si aucun plat n'en a, signalée sinon", () => {
    const none = structuredClone(tome);
    for (const r of none.recipes) r.lines = [];
    expect(buildWeekImport(none, parsePlan("S45", s45PlanGrid())).errors).toEqual([
      "La composition des plats n'a pas été lue dans le tome (format non reconnu) : rien n'est enregistré, signalez-le",
    ]);
    const one = structuredClone(tome);
    one.recipes.find((r) => r.code === "VI01")!.lines = [];
    expect(buildWeekImport(one, parsePlan("S45", s45PlanGrid())).warnings).toEqual([
      "Plats sans composition lue dans le tome : VI01",
    ]);
  });

  it("signale une portion de plat en dehors de 300–380 g, pas celle d'un petit-déjeuner", () => {
    const light = structuredClone(tome);
    light.recipes.find((r) => r.code === "VI01")!.portionWeightG = 250;
    light.recipes.find((r) => r.code === "PJ01")!.portionWeightG = 60;
    expect(buildWeekImport(light, parsePlan("S45", s45PlanGrid())).warnings).toEqual([
      "VI01 : portion de 250 g, en dehors de 300–380 g habituels pour un plat",
    ]);
  });

  it("repère les moules et plats à gratin, sans confondre les préparations « à gratin »", () => {
    expect(isMouldLabel("MOULE ROND INDIVIDUEL BIODEG 180mL")).toBe(true);
    expect(isMouldLabel("Petit plat à gratin format individuel ( sous-recette)")).toBe(true);
    expect(isMouldLabel("Légume sauteuse: Appareil à gratin de poireau, oignons et lardons")).toBe(false);
    expect(isMouldLabel("Gratiné de polenta à la raclette")).toBe(false);
    expect(isMouldLabel("Moule rond biodeg ( sous-recette)")).toBe(true);
    expect(isMouldLabel("Moule rectangulaire cake ( sous-recette)")).toBe(true);
    expect(isMouldLabel("Plat à gratin (grand format)")).toBe(true);
    // Des moules à manger ne sont pas un emballage.
    expect(isMouldLabel("moules décoquillées cuites 300/500")).toBe(false);
    expect(isMouldLabel("Poisson: Moule décortiquée (sous recette)")).toBe(false);
    expect(isMouldLabel("Bombe de graisse pour moule et plaque")).toBe(false);
    expect(isMouldLabel("muscade moulue")).toBe(false);
    expect(isMouldLabel("Bombe de graisse pour moule et plaque")).toBe(false);
    expect(isMouldLabel("Plat à gratin (grand format)")).toBe(true);
  });

  it("bloque un tome et un onglet de semaines différentes, ou un tome vide", () => {
    expect(buildWeekImport(tome, parsePlan("S46", s45PlanGrid())).errors).toEqual([
      "Le tome est celui de la semaine 45, l'onglet du plan celui de la semaine 46",
    ]);
    expect(
      buildWeekImport({ recipes: [], subRecipes: [], anomalies: [] }, parsePlan("S45", s45PlanGrid())).errors[0],
    ).toMatch(/Aucune recette/);
  });
});
