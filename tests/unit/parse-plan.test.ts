import { describe, expect, it } from "vitest";
import { type Grid, parsePlan, parsePlanNumber } from "@/modules/imports/plan/parse-plan";
import { s45PlanGrid as s45Grid } from "../helpers/s45";

describe("lecture du plan de production S45", () => {
  const plan = parsePlan("S45", s45Grid());

  it("lit les groupes de plats et de petits-déjeuners avec leur équipe", () => {
    expect(plan.week).toBe(45);
    expect(plan.groups.filter((g) => g.block === "plats")).toHaveLength(18);
    expect(plan.groups.filter((g) => g.block === "petits_dejeuners")).toHaveLength(12);
    expect(plan.groups[0]).toEqual({ codes: ["VI02", "VI08", "QD02", "QD08"], team: "A", barquettes: 677, block: "plats", row: 29 });
    expect(plan.groups.find((g) => g.codes.includes("PJ12"))).toMatchObject({ team: "G", barquettes: 141, block: "petits_dejeuners" });
  });

  it("lit les barquettes par code (semaine et premier jour)", () => {
    expect(plan.volumes.find((v) => v.code === "VI01")).toMatchObject({ weekBarquettes: 2953, firstDayBarquettes: 605, row: 104 });
    expect(plan.volumes).toHaveLength(60);
  });

  it("chaque code de plat a une équipe ; les écarts éventuels sont listés", () => {
    const teams = new Set(plan.groups.map((g) => g.team));
    expect([...teams].sort()).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(plan.anomalies).toEqual([]);
  });
});

describe("lecture du plan : anomalies", () => {
  const header = ["Référence PLATS", "", "Cuisson longue", "Nb de barq.", "Equipe"];

  it("signale une équipe non renseignée, un code en double et un code sans groupe", () => {
    const grid: Grid = [
      header,
      ["VI01/VI02", "", "Non", "500", "C"],
      ["VI03", "", "Non", "200", ""],
      ["VI02", "", "Non", "100", "Z"],
      [],
      ["", "", "", "VI01", "900", "300"],
      ["", "", "", "VI09", "50", "10"],
    ];
    const plan = parsePlan("S2552", grid);
    expect(plan.week).toBe(52);
    expect(plan.groups.map((g) => g.team)).toEqual(["C", null, null]);
    expect(plan.anomalies).toEqual([
      "Ligne 3 (VI03) : équipe non renseignée",
      "Ligne 4 (VI02) : équipe « Z » inconnue",
      "Code VI02 présent dans deux groupes (lignes 2 et 4)",
      "Code VI09 : barquettes prévues mais aucun groupe ni équipe",
    ]);
  });

  it("refuse un onglet qui n'est pas une semaine", () => {
    expect(parsePlan("Chefs d'équipe", [["Nom", "Équipe"]]).anomalies).toEqual([
      "Nom d'onglet inattendu : « Chefs d'équipe » (attendu : S45, S2552…)",
      "Bloc « Référence PLATS » introuvable dans l'onglet",
      "Bloc des barquettes par code introuvable",
    ]);
  });

  it("lit les nombres écrits à la française", () => {
    expect(parsePlanNumber("1 234")).toBe(1234);
    expect(parsePlanNumber("2,4")).toBe(2.4);
    expect(parsePlanNumber("OUI")).toBeNull();
  });
});
