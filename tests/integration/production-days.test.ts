import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { listWeekDays, setProductionDay } from "@/modules/admin/production-days";
import { evaluateMissingDeclarations } from "@/modules/alertes/service";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createTestDb } from "../helpers/test-db";

// S46-2026 : jeudi 05/11 → mercredi 11/11 ; le mercredi 11/11 est férié.
describe("calendrier des jours de production", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamUser: AuthUser;
  let s46: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    s46 = (await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 46))))[0]!.id;
    const teamA = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "A")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamUser = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-a", displayName: "Équipe A", roleCode: "equipe", teamId: teamA, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  const productionDaysOf = async () => (await listWeekDays(t.db, admin, s46)).filter((d) => d.isProductionDay).map((d) => d.day);

  it("liste les 7 jours de la semaine, travaillés par défaut du jeudi au mercredi sauf le week-end", async () => {
    const days = await listWeekDays(t.db, admin, s46);
    expect(days.map((d) => d.day)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(await productionDaysOf()).toEqual(["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("un jour férié retiré n'est plus contrôlé par les alertes ; la modification est tracée", async () => {
    await setProductionDay(t.db, admin, { day: "2026-11-11", isProductionDay: false, note: "Armistice" });
    expect(await productionDaysOf()).not.toContain("2026-11-11");
    await evaluateMissingDeclarations(t.db, { startDate: "2026-11-05", now: new Date("2026-11-12T10:00:00Z") });
    const [alert] = await t.db.select().from(s.missingDeclarationAlerts).where(eq(s.missingDeclarationAlerts.window, "lundi_mercredi")).limit(1);
    expect(alert).toMatchObject({ lastDay: "2026-11-10", missingDays: ["2026-11-09", "2026-11-10"] });
    const [audit] = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, "2026-11-11"));
    expect(audit).toMatchObject({ action: "production_day_off", userId: admin.id, reason: "Armistice" });
  });

  it("un samedi travaillé peut être ajouté, puis retiré", async () => {
    await setProductionDay(t.db, admin, { day: "2026-11-07", isProductionDay: true, note: "Rattrapage" });
    expect(await productionDaysOf()).toContain("2026-11-07");
    await setProductionDay(t.db, admin, { day: "2026-11-07", isProductionDay: false });
    expect(await productionDaysOf()).not.toContain("2026-11-07");
  });

  it("refuse un jour hors calendrier et réserve la modification à l'administration", async () => {
    await expect(setProductionDay(t.db, admin, { day: "1999-01-01", isProductionDay: true })).rejects.toThrow(/aucune semaine/);
    await expect(setProductionDay(t.db, teamUser, { day: "2026-11-09", isProductionDay: false })).rejects.toThrow(ForbiddenError);
    await expect(listWeekDays(t.db, teamUser, s46)).rejects.toThrow(ForbiddenError);
  });
});
