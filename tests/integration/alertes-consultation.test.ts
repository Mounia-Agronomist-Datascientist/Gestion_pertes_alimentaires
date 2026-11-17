import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { canReadLossAlerts, listLossAlerts, markAllLossAlertsSeen, markLossAlertSeen, updateAlertSettings } from "@/modules/alertes/consultation";
import { loadAlertSettings } from "@/modules/alertes/reglages";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { weekComparison } from "@/modules/statistiques/evolution";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-05T22:00:00Z");

describe("consultation des alertes d'analyse et réglage des seuils", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  const team: Record<string, string> = {};
  const zone: Record<string, string> = {};
  let admin: AuthUser;
  let direction: AuthUser;
  let teamC: AuthUser;
  let teamA: AuthUser;
  let respCuisine: AuthUser;
  const alert: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    for (const r of await t.db.select().from(s.teams)) team[r.letter] = r.id;
    for (const r of await t.db.select().from(s.zones)) zone[r.code] = r.id;
    const mk = async (login: string, roleCode: string, extra: { teamId?: string; zoneIds?: string[] } = {}) =>
      loadAuthUser(t.db, await createAccount(t.db, { login, displayName: login, roleCode, ...extra, password: "mot-de-passe-test" }));
    admin = await mk("admin", "admin");
    direction = await mk("direction", "direction");
    teamC = await mk("equipe-c", "equipe", { teamId: team.C });
    teamA = await mk("equipe-a", "equipe", { teamId: team.A });
    respCuisine = await mk("resp-cuisine", "resp_zone", { zoneIds: [zone.CUISINE!] });
    const [s45] = await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 45)));
    const insert = async (key: string, values: Partial<typeof s.lossAlerts.$inferInsert>) => {
      const [row] = await t.db
        .insert(s.lossAlerts)
        .values({ kind: "perte_inhabituelle", productionWeekId: s45!.id, scope: "equipe", subjectKey: key, label: key, measure: "kg", value: 20, reference: 10, rate: 1, referenceWeeks: 4, ...values })
        .returning();
      alert[key] = row!.id;
    };
    await insert("equipe-C", { scope: "equipe", subjectKey: team.C, teamId: team.C, label: "Équipe C – Bleu" });
    await insert("plat-C", { scope: "plat", subjectKey: "VI01", teamId: team.C, label: "VI01_Plat" });
    await insert("zone-cuisine", { scope: "zone", subjectKey: zone.CUISINE, teamId: null, label: "Cuisine / Production" });
    await insert("cause-A", { kind: "cause_recurrente", scope: "equipe", subjectKey: team.A, teamId: team.A, label: "Équipe A", details: { causeName: "Erreur", weeks: [] } });
  });

  afterAll(async () => {
    await t.close();
  });

  const ids = async (user: AuthUser, options = {}) => (await listLossAlerts(t.db, user, options)).map((a) => Object.entries(alert).find(([, id]) => id === a.id)![0]).sort();

  it("chacun voit les alertes de son périmètre", async () => {
    expect(await ids(admin)).toEqual(["cause-A", "equipe-C", "plat-C", "zone-cuisine"]);
    expect(await ids(direction)).toEqual(["cause-A", "equipe-C", "plat-C", "zone-cuisine"]);
    // L'équipe C voit son alerte d'équipe et celle de son plat, pas celles des autres.
    expect(await ids(teamC)).toEqual(["equipe-C", "plat-C"]);
    expect(await ids(teamA)).toEqual(["cause-A"]);
    expect(await ids(respCuisine)).toEqual(["zone-cuisine"]);
    expect(canReadLossAlerts(teamC)).toBe(true);
  });

  it("« vu » se note par compte ; la première lecture fige l'alerte", async () => {
    await markLossAlertSeen(t.db, teamC, alert["equipe-C"]!, NOW);
    expect(await ids(teamC, { unseenOnly: true })).toEqual(["plat-C"]);
    // L'administration ne l'a pas vue.
    expect(await ids(admin, { unseenOnly: true })).toContain("equipe-C");
    const [row] = await t.db.select().from(s.lossAlerts).where(eq(s.lossAlerts.id, alert["equipe-C"]!));
    expect(row).toMatchObject({ seenBy: teamC.id });
    expect(row!.seenAt).toEqual(NOW);
    // Une équipe ne peut pas noter une alerte qu'elle ne voit pas.
    await expect(markLossAlertSeen(t.db, teamA, alert["equipe-C"]!, NOW)).rejects.toThrow();
    expect(await markAllLossAlertsSeen(t.db, admin, NOW)).toBe(4);
    expect(await ids(admin, { unseenOnly: true })).toEqual([]);
  });

  it("l'administration règle les seuils, avec trace ; la tendance suit le réglage", async () => {
    await expect(updateAlertSettings(t.db, teamC, { unusualPercent: 30, minKg: 2, recurrenceWeeks: 3, stablePercent: 10 })).rejects.toThrow();
    await expect(updateAlertSettings(t.db, admin, { unusualPercent: 30, minKg: 2, recurrenceWeeks: 1, stablePercent: 10 })).rejects.toThrow(/2 semaines/);
    await updateAlertSettings(t.db, admin, { unusualPercent: 30, minKg: 2, recurrenceWeeks: 4, stablePercent: 5 }, NOW);
    expect(await loadAlertSettings(t.db)).toEqual({ unusualRate: 0.3, minKg: 2, recurrenceWeeks: 4, trendStableRate: 0.05 });
    const [audit] = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entity, "alert_settings"));
    expect(audit).toMatchObject({ userId: admin.id, action: "update" });
    expect((await weekComparison(t.db, admin, { year: 2026, number: 45 }, {}))!.trendStableRate).toBe(0.05);
  });
});
