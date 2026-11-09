import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { ImportError, saveWeekImport, teamWeekRecipes } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

describe("enregistrement d'une semaine importée", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamUser: AuthUser;
  let teamD: string;
  let s45: string;
  const preview = buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid()));
  const files = { tomeFileName: "Melba _ Imprimer les recettes.pdf", planFileName: "Plan de production.xlsx", planSheetName: "S45" };

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    teamD = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "D")))[0]!.id;
    s45 = (await t.db.select().from(s.productionWeeks).where(eq(s.productionWeeks.startDate, "2026-10-29")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamUser = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: teamD, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  it("enregistre plats, équipes, sous-recettes et compositions de la semaine", async () => {
    const created = await saveWeekImport(t.db, admin, { preview, ...files });
    expect(created).toMatchObject({ productionWeekId: s45, version: 1, status: "validee" });
    expect(await t.db.$count(s.weekRecipes, eq(s.weekRecipes.importId, created.id))).toBe(82);
    expect(await t.db.$count(s.weekSubRecipes, eq(s.weekSubRecipes.importId, created.id))).toBe(105);
    expect(await t.db.$count(s.weekRecipeLines, eq(s.weekRecipeLines.importId, created.id))).toBe(695);

    const dishes = await teamWeekRecipes(t.db, s45, teamD);
    expect(dishes.map((d) => d.code)).toEqual(["FB04", "PJ02", "PJ09", "QD01", "QD04", "VI01", "VI06", "VI12"]);
    expect(dishes.find((d) => d.code === "VI01")).toMatchObject({ weekBarquettes: 2953, portionWeightG: 315.1, totalWeightG: 315.11, totalCostEur: 1.33 });

    // Chaque sous-recette d'un plat est reliée à son détail.
    const vi01 = dishes.find((d) => d.code === "VI01")!;
    const lines = await t.db.select().from(s.weekRecipeLines).where(eq(s.weekRecipeLines.recipeId, vi01.id));
    expect(lines.every((l) => l.componentSubRecipeId)).toBe(true);
  });

  it("un nouvel import de la semaine crée la version 2 ; la version 1 est conservée, remplacée", async () => {
    const v2 = await saveWeekImport(t.db, admin, { preview, ...files });
    expect(v2.version).toBe(2);
    const versions = await t.db.select().from(s.weeklyImports).where(eq(s.weeklyImports.productionWeekId, s45));
    expect(versions.map((v) => [v.version, v.status]).sort()).toEqual([
      [1, "remplacee"],
      [2, "validee"],
    ]);
    expect((await teamWeekRecipes(t.db, s45, teamD))[0]?.importId).toBe(v2.id);
    const [audit] = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, v2.id));
    expect(audit).toMatchObject({ action: "import_week", reason: "Remplace la version 1" });
  });

  it("refuse un aperçu bloquant et réserve l'import à l'administration", async () => {
    const wrong = buildWeekImport(parseTome(s45TomeItems()), parsePlan("S46", s45PlanGrid()));
    await expect(saveWeekImport(t.db, admin, { preview: wrong, ...files })).rejects.toThrow(ImportError);
    await expect(saveWeekImport(t.db, teamUser, { preview, ...files })).rejects.toThrow(ForbiddenError);
  });
});
