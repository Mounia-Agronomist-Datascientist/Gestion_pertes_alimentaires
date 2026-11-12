import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { decomptePayloadSchema, listProductionCounts, saveProductionCount } from "@/modules/imports/decompte/service";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { actualVolumes, plannedVolumes } from "@/modules/statistiques/production";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

describe("décompte des barquettes produites", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let production: AuthUser;
  let weekId: string;
  let teamOfVi01: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    production = await loadAuthUser(t.db, await createAccount(t.db, { login: "prod", displayName: "Production", roleCode: "resp_production", password: "mot-de-passe-prod" }));
    await saveWeekImport(t.db, admin, { preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())), tomeFileName: "t.pdf", planFileName: "p.xlsx", planSheetName: "S45" });
    const [week] = await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 45)));
    weekId = week!.id;
    const [vi01] = await t.db.select().from(s.weekRecipes).where(eq(s.weekRecipes.code, "VI01"));
    teamOfVi01 = vi01!.teamId!;
  });

  afterAll(async () => {
    await t.close();
  });

  const payload = (rows: { code: string; made: number }[]) =>
    decomptePayloadSchema.parse({ fileName: "Décompte.xlsx", sheetName: "Semaine 45", year: 2026, week: 45, rows, warnings: [] });

  it("enregistre une version, la remplace sans l'effacer et trace l'import", async () => {
    await saveProductionCount(t.db, admin, payload([{ code: "VI01", made: 2900 }]));
    const second = await saveProductionCount(t.db, admin, payload([{ code: "VI01", made: 2938 }, { code: "ZZ99", made: 10 }]));
    expect(second).toMatchObject({ version: 2, total: 2948 });
    const list = await listProductionCounts(t.db, admin);
    expect(list.map((c) => [c.version, c.status])).toEqual([
      [2, "validee"],
      [1, "remplacee"],
    ]);
    const audit = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entity, "production_count"));
    expect(audit).toHaveLength(2);
    expect(audit.every((a) => a.action === "import_count")).toBe(true);
  });

  it("donne les barquettes réelles de la semaine, toutes équipes ou par équipe, à côté du prévu", async () => {
    const all = (await actualVolumes(t.db, [weekId])).get(weekId)!;
    expect(all).toMatchObject({ barquettes: 2948, dishesWithoutWeight: 1 });
    expect(all.kg).toBeGreaterThan(800);
    const team = (await actualVolumes(t.db, [weekId], teamOfVi01)).get(weekId)!;
    expect(team.barquettes).toBe(2938);
    expect((await plannedVolumes(t.db, [weekId])).get(weekId)!.barquettes).toBeGreaterThan(team.barquettes);
  });

  it("refuse les doublons, une semaine hors calendrier et les profils sans droit", async () => {
    await expect(saveProductionCount(t.db, admin, payload([{ code: "VI01", made: 1 }, { code: "VI01", made: 2 }]))).rejects.toThrow(/deux fois/);
    await expect(saveProductionCount(t.db, admin, { ...payload([{ code: "VI01", made: 1 }]), year: 2031 })).rejects.toThrow(/calendrier/);
    await expect(saveProductionCount(t.db, production, payload([{ code: "VI01", made: 1 }]))).rejects.toThrow(ForbiddenError);
    expect(decomptePayloadSchema.safeParse({ ...payload([{ code: "VI01", made: 1 }]), rows: [{ code: "Julien", made: 1 }] }).success).toBe(false);
  });
});
