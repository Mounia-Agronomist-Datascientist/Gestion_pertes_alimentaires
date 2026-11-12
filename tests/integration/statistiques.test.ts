import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { summarize } from "@/domain/statistiques";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { cancelDeclaration, correctDeclaration, createDeclaration } from "@/modules/declarations/service";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport, isMouldLabel } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { axisDetail, compareAxis, recentWeeks } from "@/modules/statistiques/analysis";
import { generalDashboard } from "@/modules/statistiques/dashboard";
import { annualEvolution, kgPerThousand, monthlyEvolution, weekComparison } from "@/modules/statistiques/evolution";
import { plannedVolumes } from "@/modules/statistiques/production";
import { causeAndDestinationRanking, productRanking } from "@/modules/statistiques/rankings";
import { weeklySummary } from "@/modules/statistiques/weekly";
import ExcelJS from "exceljs";
import { tablesToCsv } from "@/domain/csv";
import { statsContext } from "@/modules/statistiques/context";
import { EXPORT_TABS, fileName, roundKg, statsExport } from "@/modules/statistiques/exports";
import { tablesToXlsx } from "@/modules/statistiques/xlsx";
import { adjacentOf, loadFacts } from "@/modules/statistiques/facts";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T14:00:00Z");
const S45 = { kind: "semaine", year: 2026, number: 45 } as const;

describe("lecture des pertes pour les statistiques", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let direction: AuthUser;
  let teamC: AuthUser;
  let teamD: AuthUser;
  let teamDId: string;
  let compost: string;
  let don: string;
  let shared: { id: string; recipes: number };

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    const team = (letter: string) => id(t.db.select().from(s.teams).where(eq(s.teams.letter, letter)));
    const account = async (login: string, roleCode: string, teamId?: string) =>
      loadAuthUser(t.db, await createAccount(t.db, { login, displayName: login, roleCode, teamId, password: `mot-de-passe-${login}` }));
    admin = await account("admin", "admin");
    direction = await account("direction", "direction");
    teamDId = await team("D");
    teamD = await account("equipe-d", "equipe", teamDId);
    teamC = await account("equipe-c", "equipe", await team("C"));
    await saveWeekImport(t.db, admin, { preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())), tomeFileName: "t.pdf", planFileName: "p.xlsx", planSheetName: "S45" });
    const vi01 = (await weekCatalogs(t.db, teamD, "2026-11-02"))[0]!.dishes.find((d) => d.code === "VI01")!.id;
    const cuisine = await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")));
    const cause = await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")));
    const dest = (code: string) => id(t.db.select().from(s.destinations).where(eq(s.destinations.code, code)));
    const tgtg = await dest("TGTG");
    compost = await dest("ALCHIMISTES");
    don = await dest("DON");
    const input = (occurredOn: string, product: object, method: string, quantity: number, unitCode: string, destinations: object[]) => ({
      occurredOn,
      subzoneId: cuisine,
      product,
      method,
      quantity,
      unitCode,
      causeId: cause,
      destinations,
    });
    const dish = { weekItem: { kind: "plat", id: vi01 } };
    await createDeclaration(t.db, teamD, input("2026-11-02", dish, "comptage", 10, "barquette", [{ destinationId: tgtg, quantity: 10, recoveredAmountEur: 6 }]), NOW);
    const corrected = await createDeclaration(t.db, teamD, input("2026-11-02", dish, "comptage", 2, "barquette", [{ destinationId: compost, quantity: 2, binNumber: "1" }]), NOW);
    await correctDeclaration(t.db, teamD, corrected.id, input("2026-11-02", dish, "comptage", 3, "barquette", [{ destinationId: don, quantity: 3 }]), { reason: "Recompté", expectedRevision: 1 }, NOW);
    const cancelled = await createDeclaration(t.db, teamD, input("2026-11-02", dish, "comptage", 50, "barquette", [{ destinationId: compost, quantity: 50, binNumber: "1" }]), NOW);
    await cancelDeclaration(t.db, admin, cancelled.id, { reason: "Doublon", expectedRevision: 1 }, NOW);
    // Sous-recette qui sert à plusieurs plats de la semaine.
    const used = await t.db
      .select({ id: s.weekRecipeLines.componentSubRecipeId, name: s.weekSubRecipes.name, recipes: count() })
      .from(s.weekRecipeLines)
      .innerJoin(s.weekSubRecipes, eq(s.weekSubRecipes.id, s.weekRecipeLines.componentSubRecipeId))
      .where(and(isNotNull(s.weekRecipeLines.componentSubRecipeId), isNotNull(s.weekRecipeLines.recipeId)))
      .groupBy(s.weekRecipeLines.componentSubRecipeId, s.weekSubRecipes.name)
      .orderBy(desc(count()));
    const mostUsed = used.find((u) => !isMouldLabel(u.name));
    shared = { id: mostUsed!.id!, recipes: mostUsed!.recipes };
    await createDeclaration(t.db, teamD, input("2026-11-02", { weekItem: { kind: "sous_recette", id: shared.id } }, "pesee", 2, "kg", [{ destinationId: compost, quantity: 2, binNumber: "1" }]), NOW);
    // Équipe C, en octobre mais dans la même semaine de production S45 (jeudi 29/10 → mercredi 04/11).
    await createDeclaration(t.db, teamC, input("2026-10-30", { freeLabel: "Carottes", category: "matiere_premiere" }, "pesee", 1.5, "kg", [{ destinationId: compost, quantity: 1.5, binNumber: "1" }]), NOW);
  });

  afterAll(async () => {
    await t.close();
  });

  it("compte la dernière version, sans les annulées, avec les destinations de cette version", async () => {
    const facts = await loadFacts(t.db, direction, S45);
    expect(facts).toHaveLength(4);
    const s45 = summarize(facts, true);
    expect(s45).toMatchObject({ events: 4, barquettes: 13, foodNotConverted: 0 });
    expect(Object.keys(s45.kgByDestinationKind).sort()).toEqual(["compost", "don", "vente"]);
    expect(s45.cost).toMatchObject({ recoveredEur: 6, valued: 3 });
  });

  it("limite une équipe à ses pertes et ne lui donne aucun euro", async () => {
    const facts = await loadFacts(t.db, teamC, S45);
    expect(facts.map((f) => f.productName)).toEqual(["Carottes"]);
    expect(facts[0]!.cost).toBeNull();
    expect((await loadFacts(t.db, teamD, S45)).every((f) => f.teamId === teamDId && f.cost === null)).toBe(true);
  });

  it("filtre par mois (date réelle), année de production, équipe et destination", async () => {
    expect(await loadFacts(t.db, direction, { kind: "mois", year: 2026, month: 11 })).toHaveLength(3);
    expect(await loadFacts(t.db, direction, { kind: "mois", year: 2026, month: 10 })).toHaveLength(1);
    expect(await loadFacts(t.db, direction, { kind: "annee", year: 2026 })).toHaveLength(4);
    expect(await loadFacts(t.db, direction, { kind: "periode", from: "2026-11-03", to: "2026-11-30" })).toHaveLength(0);
    expect(await loadFacts(t.db, direction, S45, { teamId: teamDId })).toHaveLength(3);
    expect((await loadFacts(t.db, direction, S45, { destinationId: compost })).map((f) => f.productName)).toContain("Carottes");
    expect(await loadFacts(t.db, direction, S45, { destinationId: compost })).toHaveLength(2);
    expect(await loadFacts(t.db, direction, S45, { category: "matiere_premiere" })).toHaveLength(1);
    expect(await loadFacts(t.db, direction, { kind: "semaine", year: 2031, number: 45 })).toEqual([]);
  });

  it("trouve les semaines voisines dans le calendrier", async () => {
    expect(await adjacentOf(t.db, S45, -1)).toEqual({ kind: "semaine", year: 2026, number: 44 });
    expect(await adjacentOf(t.db, S45, 1)).toEqual({ kind: "semaine", year: 2026, number: 46 });
    expect(await adjacentOf(t.db, { kind: "semaine", year: 2031, number: 45 }, -1)).toBeNull();
  });

  it("tableau de bord général : période, période précédente et euros selon le profil", async () => {
    const forDirection = await generalDashboard(t.db, direction, S45, {});
    expect(forDirection).toMatchObject({ withCosts: true, previousPeriod: { number: 44 }, nextPeriod: { number: 46 }, previous: { events: 0 } });
    expect(forDirection.current.cost?.recoveredEur).toBe(6);
    const forTeam = await generalDashboard(t.db, teamC, S45, {});
    expect(forTeam).toMatchObject({ withCosts: false, current: { events: 1, foodKg: 1.5, cost: null, kgByDestinationKind: { compost: 1.5 } } });
  });

  it("compare les équipes (responsables seulement) et détaille une zone", async () => {
    const teams = await compareAxis(t.db, direction, "equipe", S45, {});
    expect(teams.rows.map((r) => [r.label, r.summary.events, r.previous?.events])).toEqual([
      ["Équipe C – Rose", 1, 0],
      ["Équipe D – Jaune", 3, 0],
    ]);
    await expect(compareAxis(t.db, teamC, "equipe", S45, {})).rejects.toThrow(ForbiddenError);

    const zones = await compareAxis(t.db, direction, "zone", S45, {});
    expect(zones.rows).toHaveLength(1);
    const cuisine = await axisDetail(t.db, direction, "zone", zones.rows[0]!.id, S45, {});
    expect(cuisine.label).toBe("Cuisine / Production");
    expect(cuisine.causes).toHaveLength(1);
    expect(cuisine.products.map((p) => [p.label, p.summary.events])).toEqual(
      expect.arrayContaining([["Carottes", 1], [expect.stringMatching(/^VI01_/) as unknown as string, 2]]),
    );
    expect(cuisine.teams.map((x) => x.label).sort()).toEqual(["Équipe C – Rose", "Équipe D – Jaune"]);
  });

  it("une équipe voit le détail de son équipe seulement, sans comparaison", async () => {
    const own = await axisDetail(t.db, teamD, "equipe", teamDId, S45, {});
    expect(own).toMatchObject({ withCosts: false, label: "Équipe D – Jaune", teams: [] });
    expect(own.summary.events).toBe(3);
    await expect(axisDetail(t.db, teamC, "equipe", teamDId, S45, {})).rejects.toThrow(ForbiddenError);
  });

  it("kg des dernières semaines de production", async () => {
    const weeks = await recentWeeks(t.db, direction, S45, {}, 3);
    expect(weeks.map((w) => [w.number, w.summary.events])).toEqual([
      [43, 0],
      [44, 0],
      [45, 4],
    ]);
  });

  it("classe les plats par formule et compte une sous-recette une fois, avec les plats qui l'utilisent", async () => {
    const plats = await productRanking(t.db, direction, S45, {}, "plats", "kg");
    expect(plats.rows.map((r) => [r.label.slice(0, 5), r.summary.events, r.summary.barquettes])).toEqual([["VI01_", 2, 13]]);
    expect(plats.rows[0]!.mainCause).toMatchObject({ name: expect.any(String), share: 1 });

    const subs = await productRanking(t.db, direction, S45, {}, "sous_recettes", "kg");
    expect(subs.rows).toHaveLength(1);
    expect(subs.rows[0]!.summary).toMatchObject({ events: 1, foodKg: 2 });
    expect(subs.rows[0]!.usedIn).toHaveLength(shared.recipes);

    const all = await productRanking(t.db, teamC, S45, {}, "tous", "evenements");
    expect(all).toMatchObject({ withCosts: false, total: 1 });
  });

  it("classe les causes et totalise les destinations", async () => {
    const r = await causeAndDestinationRanking(t.db, direction, S45, {}, "evenements");
    expect(r.causes.map((c) => [c.summary.events, c.mainZone])).toEqual([[4, "Cuisine / Production"]]);
    expect(r.destinations.map((d) => [d.name, d.events])).toEqual(
      expect.arrayContaining([
        ["Les Alchimistes – compost", 2],
        ["Association / don", 1],
        ["Too Good To Go", 1],
      ]),
    );
  });

  it("volume prévu de la semaine d'après le plan importé, pour toutes les équipes ou une seule", async () => {
    const [week] = await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 45)));
    const all = (await plannedVolumes(t.db, [week!.id])).get(week!.id)!;
    const teamOnly = (await plannedVolumes(t.db, [week!.id], teamDId)).get(week!.id)!;
    expect(all.barquettes).toBeGreaterThan(teamOnly.barquettes);
    expect(teamOnly.barquettes).toBeGreaterThan(0);
    expect(all.kg).toBeGreaterThan(all.barquettes * 0.25);
    expect((await plannedVolumes(t.db, [week!.id])).size).toBe(1);
    expect(kgPerThousand(10, { barquettes: 20000, kg: null, dishesWithoutWeight: 0, costEur: null, dishesWithoutCost: 0 })).toBe(0.5);
    expect(kgPerThousand(10, null)).toBeNull();
  });

  it("compare la semaine à la précédente, à la moyenne et à volume égal", async () => {
    const c = (await weekComparison(t.db, direction, { year: 2026, number: 45 }, {}, 6))!;
    expect(c.series.map((p) => p.number)).toEqual([40, 41, 42, 43, 44, 45]);
    expect(c.current.summary.events).toBe(4);
    expect(c.current.planned?.barquettes).toBeGreaterThan(0);
    expect(c.current.perThousand).toBe(kgPerThousand(c.current.summary.foodKg, c.current.planned));
    expect(c.previous?.planned).toBeNull();
    expect(c.average).toMatchObject({ weeks: 4, events: 0, perThousand: null });
    expect(c.lastYear).toBeNull();
    // Une équipe compare avec le volume prévu de son équipe.
    const team = (await weekComparison(t.db, teamD, { year: 2026, number: 45 }, {}, 2))!;
    expect(team.volumeTeam).toBe(teamDId);
    expect(await weekComparison(t.db, direction, { year: 2031, number: 45 }, {})).toBeNull();
  });

  it("évolution mensuelle (date réelle) et annuelle (année de production)", async () => {
    const months = await monthlyEvolution(t.db, direction, { year: 2026, month: 11 }, {}, 3);
    expect(months.map((m) => [m.month, m.summary.events])).toEqual([
      [9, 0],
      [10, 1],
      [11, 3],
    ]);
    expect((await annualEvolution(t.db, direction, 2026, {})).map((y) => [y.year, y.summary.events])).toEqual([[2026, 4]]);
  });

  it("synthèse de la semaine : zones, causes et produits classés en euros (ou en kg pour une équipe)", async () => {
    const w = (await weeklySummary(t.db, direction, { year: 2026, number: 45 }, {}))!;
    expect(w).toMatchObject({ withCosts: true, by: "cout", summary: { events: 4 } });
    expect(w.byZone.map((r) => [r.label, Math.round(r.share * 100)])).toEqual([["Cuisine / Production", 100]]);
    expect(w.byProduct.some((r) => r.label.startsWith("VI01_"))).toBe(true);
    expect(w.byCause).toHaveLength(1);
    // Pas de pertes en S44 : pas de « points d'attention ».
    expect(w.rises).toEqual([]);
    const team = (await weeklySummary(t.db, teamC, { year: 2026, number: 45 }, {}))!;
    expect(team).toMatchObject({ withCosts: false, by: "kg", summary: { events: 1, foodKg: 1.5 } });
    expect(team.byProduct.map((r) => [r.label, r.value])).toEqual([["Carottes", 1.5]]);
  });

  it("exporte chaque onglet avec la période, les filtres et les droits de l'écran", async () => {
    const params = { periode: "semaine", annee: "2026", semaine: "45" };
    const exportOf = async (user: AuthUser, tab: (typeof EXPORT_TABS)[number], extra: Record<string, string> = {}) =>
      statsExport(t.db, user, tab, await statsContext(t.db, user, { ...params, ...extra }), { ...params, ...extra });
    for (const tab of EXPORT_TABS) {
      const result = await exportOf(direction, tab);
      expect(result, tab).not.toBeNull();
      expect(result!.tables.length, tab).toBeGreaterThan(0);
      for (const table of result!.tables) for (const row of table.rows) expect(row, `${tab} / ${table.title}`).toHaveLength(table.headers.length);
    }
    // Direction : détail du coût par composante ; vue générale = S45 puis S44.
    const general = (await exportOf(direction, "general"))!;
    expect(general.name).toBe("statistiques-s45-2026");
    const indicators = general.tables[0]!;
    expect(indicators.headers).toEqual(expect.arrayContaining(["Matières premières (€)", "Coût brut (€)", "Recettes (€)", "Coût net (€)"]));
    const dashboard = await generalDashboard(t.db, direction, S45, {});
    expect(indicators.rows[0]!.slice(0, 4)).toEqual(["S45-2026", roundKg(dashboard.current.foodKg), dashboard.current.barquettes, dashboard.current.events]);
    expect(indicators.rows[0]!.at(-1)).toBe(dashboard.current.cost!.netEur);
    // Une équipe : ses pertes, aucun euro, et pas de comparaison des équipes.
    const team = (await exportOf(teamC, "general"))!;
    expect(team.tables[0]!.headers.some((h) => h.includes("€"))).toBe(false);
    expect(team.tables[0]!.rows[0]!.slice(0, 4)).toEqual(["S45-2026", 1.5, 0, 1]);
    const ownTeam = (await exportOf(teamC, "equipes"))!;
    expect(ownTeam.tables.map((x) => x.title)).toContain("Semaines");
    expect(await exportOf(teamC, "equipes", { id: teamDId })).toBeNull();
    // Filtres de l'écran : équipe D seulement.
    const filtered = (await exportOf(direction, "causes", { equipe: teamDId }))!;
    const teamDFood = (await generalDashboard(t.db, direction, S45, { teamId: teamDId })).current.foodKg;
    expect(filtered.tables[0]!.rows.map((r) => r[2])).toEqual([roundKg(teamDFood)]);
    // Synthèse : un seul tableau demandé, ou les deux.
    expect((await exportOf(direction, "synthese", { tableau: "semaines" }))!.tables.map((x) => x.title)).toEqual(["12 semaines"]);
    expect((await exportOf(direction, "synthese"))!.tables).toHaveLength(2);
    // Classeur Excel : un onglet par tableau, en-têtes et nombres conservés.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await tablesToXlsx(general.tables)).buffer as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Indicateurs", "Devenir des pertes"]);
    expect(workbook.worksheets[0]!.getCell("B2").value).toBe(roundKg(dashboard.current.foodKg));
    expect(tablesToCsv(general.tables)).toContain("Indicateurs\r\nPériode;Kg alimentaires");
    expect(fileName("Produits", "Sous-recettes", "S45-2026")).toBe("produits-sous-recettes-s45-2026");
  });

  it("refusé sans droit de statistiques", async () => {
    const noStats = { ...admin, permissions: new Set<string>() };
    await expect(loadFacts(t.db, noStats, S45)).rejects.toThrow(ForbiddenError);
  });
});
