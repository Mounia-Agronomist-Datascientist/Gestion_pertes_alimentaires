import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { AGRIBALYSE_PROPOSAL } from "@/modules/environnement/agribalyse-proposal";
import { listFamiliesForAdmin, loadAgribalyseProposal, proposeFactor, retainedValue, validateFactors } from "@/modules/environnement/factors";
import { listIngredientsForMapping, saveIngredientMappings } from "@/modules/environnement/ingredients";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { environmentDashboard, loadCo2Facts } from "@/modules/statistiques/environnement";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T14:00:00Z");
const WEEK = { kind: "semaine" as const, year: 2026, number: 45 };
const labels = { category: (c: string) => c, destinationKind: (k: string) => k };

describe("CO2e des pertes", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamD: AuthUser;
  let ref: Record<string, string>;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamD = await loadAuthUser(
      t.db,
      await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: await id(t.db.select().from(s.teams).where(eq(s.teams.letter, "D"))), password: "mot-de-passe-equipe" }),
    );
    await saveWeekImport(t.db, admin, { preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())), tomeFileName: "t.pdf", planFileName: "p.xlsx", planSheetName: "S45" });
    ref = {
      vi01: (await weekCatalogs(t.db, teamD, "2026-11-02"))[0]!.dishes.find((d) => d.code === "VI01")!.id,
      cuisine: await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE"))),
      cause: await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION"))),
      compost: await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES"))),
      don: await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "DON"))),
    };
    const declare = (product: object, method: string, quantity: number, unitCode: string, destinations: object[]) =>
      createDeclaration(t.db, teamD, { occurredOn: "2026-11-02", subzoneId: ref.cuisine, product, method, quantity, unitCode, causeId: ref.cause, destinations }, NOW);
    // 10 barquettes de VI01 (6 compostées, 4 données) et 2 kg de carottes hors liste.
    await declare({ weekItem: { kind: "plat", id: ref.vi01 } }, "comptage", 10, "barquette", [
      { destinationId: ref.compost, quantity: 6 },
      { destinationId: ref.don, quantity: 4 },
    ]);
    await declare({ freeLabel: "Carottes", category: "matiere_premiere" }, "pesee", 2, "kg", [{ destinationId: ref.compost, quantity: 2 }]);
  });

  afterAll(async () => {
    await t.close();
  });

  it("sans facteur validé, tout est non couvert", async () => {
    const { facts, validFactors } = await loadCo2Facts(t.db, admin, WEEK);
    expect(validFactors).toBe(0);
    expect(facts).toHaveLength(2);
    expect(facts.every((f) => f.co2.method === "non_couvert" && f.co2.co2eKg === 0)).toBe(true);
  });

  it("une fois les facteurs validés et les ingrédients rattachés : plat mesuré, perte hors liste estimée", async () => {
    await loadAgribalyseProposal(t.db, admin, new Date("2026-11-13T10:00:00Z"));
    const families = await listFamiliesForAdmin(t.db, admin);
    await validateFactors(t.db, admin, families.map((f) => f.proposal!.id), new Date("2026-11-13T10:00:00Z"));
    const ingredients = await listIngredientsForMapping(t.db, admin);
    await saveIngredientMappings(
      t.db,
      admin,
      ingredients.filter((i) => i.suggestion).map((i) => (i.suggestion!.kind === "famille" ? { key: i.key, label: i.label, status: "famille" as const, familyId: i.suggestion!.familyId! } : { key: i.key, label: i.label, status: "non_alimentaire" as const, familyId: null })),
    );

    const { facts } = await loadCo2Facts(t.db, admin, WEEK);
    const dish = facts.find((f) => f.fact.productCode === "VI01")!;
    const carrots = facts.find((f) => f.fact.productName === "Carottes")!;
    expect(dish.co2.method).toBe("mesure");
    expect(dish.co2.co2eKg).toBeGreaterThan(0);
    expect(dish.co2.kgMeasured + dish.co2.kgUncovered).toBeCloseTo(dish.fact.netKg!, 3);
    const carrot = retainedValue(AGRIBALYSE_PROPOSAL.find((p) => p.code === "CAROTTE")!.stages);
    expect(carrots.co2).toMatchObject({ method: "estime", co2eKg: Math.round(2 * carrot * 10_000) / 10_000, kgEstimated: 2 });

    const dashboard = await environmentDashboard(t.db, admin, WEEK, WEEK, {}, labels);
    expect(dashboard.summary.co2eKg).toBeCloseTo(dish.co2.co2eKg + carrots.co2.co2eKg, 3);
    expect(dashboard.summary.co2ByMethod.estime).toBeCloseTo(carrots.co2.co2eKg, 3);
    // Devenir : la perte du plat est répartie 6/4 entre compost et don.
    const don = dashboard.byDestination.find((d) => d.key === "don")!;
    expect(don.summary.co2eKg).toBeCloseTo(dish.co2.co2eKg * 0.4, 3);
    expect(dashboard.series.at(-1)!.summary.co2eKg).toBeCloseTo(dashboard.summary.co2eKg, 3);
    // Une équipe ne voit que ses pertes, et le même CO2e.
    expect((await loadCo2Facts(t.db, teamD, WEEK)).facts).toHaveLength(2);
  });

  it("une nouvelle version de facteur ne réécrit pas le CO2e d'une perte passée", async () => {
    const before = (await loadCo2Facts(t.db, admin, WEEK)).facts.find((f) => f.fact.productName === "Carottes")!.co2.co2eKg;
    const carrot = (await listFamiliesForAdmin(t.db, admin)).find((f) => f.code === "CAROTTE")!;
    const later = new Date("2026-12-01T10:00:00Z");
    const v2 = await proposeFactor(t.db, admin, carrot.id, { kgCo2ePerKg: 10, source: "Test", sourceVersion: null, referenceName: null, hypotheses: "Valeur de test très différente." }, later);
    await validateFactors(t.db, admin, [v2.id], later);
    expect((await loadCo2Facts(t.db, admin, WEEK)).facts.find((f) => f.fact.productName === "Carottes")!.co2.co2eKg).toBe(before);
  });
});
