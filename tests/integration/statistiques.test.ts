import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { summarize } from "@/domain/statistiques";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { cancelDeclaration, correctDeclaration, createDeclaration } from "@/modules/declarations/service";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { generalDashboard } from "@/modules/statistiques/dashboard";
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
    const corrected = await createDeclaration(t.db, teamD, input("2026-11-02", dish, "comptage", 2, "barquette", [{ destinationId: compost, quantity: 2 }]), NOW);
    await correctDeclaration(t.db, teamD, corrected.id, input("2026-11-02", dish, "comptage", 3, "barquette", [{ destinationId: don, quantity: 3 }]), { reason: "Recompté", expectedRevision: 1 }, NOW);
    const cancelled = await createDeclaration(t.db, teamD, input("2026-11-02", dish, "comptage", 50, "barquette", [{ destinationId: compost, quantity: 50 }]), NOW);
    await cancelDeclaration(t.db, admin, cancelled.id, { reason: "Doublon", expectedRevision: 1 }, NOW);
    // Équipe C, en octobre mais dans la même semaine de production S45 (jeudi 29/10 → mercredi 04/11).
    await createDeclaration(t.db, teamC, input("2026-10-30", { freeLabel: "Carottes", category: "matiere_premiere" }, "pesee", 1.5, "kg", [{ destinationId: compost, quantity: 1.5 }]), NOW);
  });

  afterAll(async () => {
    await t.close();
  });

  it("compte la dernière version, sans les annulées, avec les destinations de cette version", async () => {
    const facts = await loadFacts(t.db, direction, S45);
    expect(facts).toHaveLength(3);
    const s45 = summarize(facts, true);
    expect(s45).toMatchObject({ events: 3, barquettes: 13, foodNotConverted: 0 });
    expect(Object.keys(s45.kgByDestinationKind).sort()).toEqual(["compost", "don", "vente"]);
    expect(s45.cost).toMatchObject({ recoveredEur: 6, valued: 2 });
  });

  it("limite une équipe à ses pertes et ne lui donne aucun euro", async () => {
    const facts = await loadFacts(t.db, teamC, S45);
    expect(facts.map((f) => f.productName)).toEqual(["Carottes"]);
    expect(facts[0]!.cost).toBeNull();
    expect((await loadFacts(t.db, teamD, S45)).every((f) => f.teamId === teamDId && f.cost === null)).toBe(true);
  });

  it("filtre par mois (date réelle), année de production, équipe et destination", async () => {
    expect(await loadFacts(t.db, direction, { kind: "mois", year: 2026, month: 11 })).toHaveLength(2);
    expect(await loadFacts(t.db, direction, { kind: "mois", year: 2026, month: 10 })).toHaveLength(1);
    expect(await loadFacts(t.db, direction, { kind: "annee", year: 2026 })).toHaveLength(3);
    expect(await loadFacts(t.db, direction, { kind: "periode", from: "2026-11-03", to: "2026-11-30" })).toHaveLength(0);
    expect(await loadFacts(t.db, direction, S45, { teamId: teamDId })).toHaveLength(2);
    expect((await loadFacts(t.db, direction, S45, { destinationId: compost })).map((f) => f.productName)).toEqual(["Carottes"]);
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

  it("refusé sans droit de statistiques", async () => {
    const noStats = { ...admin, permissions: new Set<string>() };
    await expect(loadFacts(t.db, noStats, S45)).rejects.toThrow(ForbiddenError);
  });
});
