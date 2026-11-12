import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { weekCostSummary } from "@/modules/couts/summary";
import { cancelDeclaration, createDeclaration } from "@/modules/declarations/service";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T14:00:00Z");

describe("synthèse des coûts d'une semaine", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let production: AuthUser;
  let teamD: AuthUser;
  let s45: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    production = await loadAuthUser(t.db, await createAccount(t.db, { login: "prod", displayName: "Production", roleCode: "resp_production", password: "mot-de-passe-prod" }));
    teamD = await loadAuthUser(
      t.db,
      await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: await id(t.db.select().from(s.teams).where(eq(s.teams.letter, "D"))), password: "mot-de-passe-equipe" }),
    );
    await saveWeekImport(t.db, admin, { preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())), tomeFileName: "t.pdf", planFileName: "p.xlsx", planSheetName: "S45" });
    s45 = await id(t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 45))));
    const vi01 = (await weekCatalogs(t.db, teamD, "2026-11-02"))[0]!.dishes.find((d) => d.code === "VI01")!.id;
    const cuisine = await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")));
    const cause = await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")));
    const tgtg = await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "TGTG")));
    const compost = await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")));
    const declare = (product: object, quantity: number, destinations: object[]) =>
      createDeclaration(t.db, teamD, { occurredOn: "2026-11-02", subzoneId: cuisine, product, method: "comptage", quantity, unitCode: "barquette", causeId: cause, destinations }, NOW);
    await declare({ weekItem: { kind: "plat", id: vi01 } }, 10, [{ destinationId: tgtg, quantity: 10, recoveredAmountEur: 6 }]); // 13,30 € brut
    await declare({ weekItem: { kind: "plat", id: vi01 } }, 2, [{ destinationId: compost, quantity: 2, binNumber: "1" }]); // 2,66 €
    await declare({ freeLabel: "Produit sans coût", category: "produit_fini" }, 3, [{ destinationId: compost, quantity: 3, binNumber: "1" }]);
    const cancelled = await declare({ weekItem: { kind: "plat", id: vi01 } }, 50, [{ destinationId: compost, quantity: 50, binNumber: "1" }]);
    await cancelDeclaration(t.db, admin, cancelled.id, { reason: "Doublon", expectedRevision: 1 }, NOW);
  });

  afterAll(async () => {
    await t.close();
  });

  it("additionne brut, recettes et net, sans les annulées ni les pertes sans coût", async () => {
    const summary = await weekCostSummary(t.db, production, s45);
    expect(summary).toMatchObject({ declarations: 3, valued: 2, notValued: 1 });
    expect(summary.totals).toEqual({ materialEur: 15.96, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: 15.96, recoveredEur: 6, netEur: 9.96 });
    expect(summary.byTeam.map((x) => [x.letter, x.grossEur, x.netEur])).toEqual([["D", 15.96, 9.96]]);
    expect(summary.byZone.map((x) => x.grossEur)).toEqual([15.96]);
  });

  it("réservé aux indicateurs économiques (administration, production, direction)", async () => {
    await expect(weekCostSummary(t.db, teamD, s45)).rejects.toThrow(ForbiddenError);
  });
});
