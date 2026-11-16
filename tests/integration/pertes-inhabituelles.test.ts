import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { evaluateLossAlerts, loadAlertSettings } from "@/modules/alertes/analyse";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { correctDeclaration, createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

// S42 : 08/10 → 14/10 ; S43 : 15/10 → 21/10 ; S44 : 22/10 → 28/10 ; S45 : 29/10 → 04/11 (2026).
const START = "2026-10-08";
const THURSDAY_S46 = new Date("2026-11-05T21:30:00Z");

describe("alertes : pertes inhabituelles", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  const team: Record<string, string> = {};
  let teamC: AuthUser;
  let teamA: AuthUser;
  let cuisine: string;
  let cause: string;
  let compost: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    for (const r of await t.db.select().from(s.teams)) team[r.letter] = r.id;
    cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")))[0]!.id;
    cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")))[0]!.id;
    compost = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    const mk = async (login: string, teamId: string) => loadAuthUser(t.db, await createAccount(t.db, { login, displayName: login, roleCode: "equipe", teamId, password: "mot-de-passe-test" }));
    teamC = await mk("equipe-c", team.C!);
    teamA = await mk("equipe-a", team.A!);
  });

  afterAll(async () => {
    await t.close();
  });

  const input = (occurredOn: string, kg: number) => ({
    occurredOn,
    subzoneId: cuisine,
    product: { freeLabel: "Carottes", category: "matiere_premiere" },
    method: "pesee",
    quantity: kg,
    unitCode: "kg",
    causeId: cause,
    destinations: [{ destinationId: compost, quantity: kg, binNumber: "1" }],
  });
  const declare = (user: AuthUser, occurredOn: string, kg: number) => createDeclaration(t.db, user, input(occurredOn, kg), new Date(`${occurredOn}T12:00:00Z`));
  const alerts = () => t.db.select().from(s.lossAlerts).where(eq(s.lossAlerts.kind, "perte_inhabituelle"));

  it("seuils décidés le 16/11/2026 chargés par la migration", async () => {
    expect(await loadAlertSettings(t.db)).toEqual({ unusualRate: 0.5, minKg: 5, recurrenceWeeks: 3, trendStableRate: 0.1 });
  });

  it("n'évalue rien sans date de mise en service", async () => {
    expect(await evaluateLossAlerts(t.db, { startDate: null, now: THURSDAY_S46 })).toEqual({ weeks: 0, created: 0, updated: 0, removed: 0 });
  });

  it("signale l'équipe et la zone qui dépassent de 50 % leur moyenne, pas les autres", async () => {
    // Même cause chaque semaine dans ces données : les causes récurrentes (étape 6.3) sont testées à part.
    await t.db.update(s.alertSettings).set({ recurrenceWeeks: 9 });
    // Équipe C : 10 kg par semaine, puis 20 kg en S45 (+100 %). Équipe A : 10 kg, puis 12 kg (+20 %).
    for (const day of ["2026-10-09", "2026-10-16", "2026-10-23"]) {
      await declare(teamC, day, 10);
      await declare(teamA, day, 10);
    }
    const lastC = await declare(teamC, "2026-10-30", 20);
    await declare(teamA, "2026-10-30", 12);

    const result = await evaluateLossAlerts(t.db, { startDate: START, now: THURSDAY_S46 });
    // S43, S44 et S45 sont terminées et dans la période revue ; S43 n'a qu'une semaine de référence (S42).
    expect(result).toEqual({ weeks: 3, created: 2, updated: 0, removed: 0 });
    const rows = await alerts();
    expect(rows.map((r) => [r.scope, r.label, r.measure, r.value, r.reference, r.rate, r.referenceWeeks]).sort()).toEqual(
      [
        ["equipe", rows.find((r) => r.scope === "equipe")!.label, "kg", 20, 10, 1, 3],
        // Cuisine : 20 kg par semaine (C + A), puis 32 kg : +60 %.
        ["zone", "Cuisine / Production", "kg", 32, 20, 0.6, 3],
      ].sort(),
    );
    const teamAlert = rows.find((r) => r.scope === "equipe")!;
    expect(teamAlert).toMatchObject({ teamId: team.C, subjectKey: team.C });
    expect(teamAlert.label).toMatch(/^Équipe C/);
    expect(teamAlert.details).toEqual({ causes: [{ label: expect.any(String), kg: 20 }], products: [{ label: "Carottes", kg: 20 }] });

    // Relancée la nuit suivante : rien de nouveau.
    expect(await evaluateLossAlerts(t.db, { startDate: START, now: THURSDAY_S46 })).toMatchObject({ created: 0, updated: 2, removed: 0 });

    // L'alerte de zone est vue ; l'équipe C corrige sa perte (12 kg) : l'alerte d'équipe disparaît, celle vue reste.
    await t.db.update(s.lossAlerts).set({ seenAt: THURSDAY_S46 }).where(eq(s.lossAlerts.scope, "zone"));
    await correctDeclaration(t.db, teamC, lastC.id, input("2026-10-30", 12), { reason: "Mauvaise pesée", expectedRevision: 1 }, new Date("2026-10-31T09:00:00Z"));
    expect(await evaluateLossAlerts(t.db, { startDate: START, now: THURSDAY_S46 })).toMatchObject({ created: 0, removed: 1 });
    expect((await alerts()).map((r) => r.scope)).toEqual(["zone"]);
  });

  it("les semaines d'avant la mise en service ne servent pas de référence", async () => {
    await t.db.delete(s.lossAlerts);
    // Mise en service au début de S45 : aucune semaine de référence.
    expect(await evaluateLossAlerts(t.db, { startDate: "2026-10-29", now: THURSDAY_S46 })).toEqual({ weeks: 1, created: 0, updated: 0, removed: 0 });
    expect(await t.db.select().from(s.lossAlerts).where(and(eq(s.lossAlerts.kind, "perte_inhabituelle")))).toEqual([]);
  });
});
