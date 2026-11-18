import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { evaluateLossAlerts } from "@/modules/alertes/analyse";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

// S43 : 15/10 → 21/10 ; S44 : 22/10 → 28/10 ; S45 : 29/10 → 04/11 (2026).
const START = "2026-10-15";
const THURSDAY_S46 = new Date("2026-11-05T21:30:00Z");

describe("alertes : causes récurrentes", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  const team: Record<string, string> = {};
  let teamC: AuthUser;
  let teamA: AuthUser;
  let cuisine: string;
  const cause: Record<string, string> = {};
  let compost: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    for (const r of await t.db.select().from(s.teams)) team[r.letter] = r.id;
    cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")))[0]!.id;
    for (const r of await t.db.select().from(s.causes)) if (r.code) cause[r.code] = r.id;
    compost = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    const mk = async (login: string, teamId: string) =>
      loadAuthUser(
        t.db,
        await createAccount(t.db, {
          login,
          displayName: login,
          roleCode: "equipe",
          teamId,
          password: "mot-de-passe-test",
        }),
      );
    teamC = await mk("equipe-c", team.C!);
    teamA = await mk("equipe-a", team.A!);
    // Pas de perte inhabituelle dans ces données : seules les causes récurrentes sont attendues.
    await t.db.update(s.alertSettings).set({ minKg: 1000 });
  });

  afterAll(async () => {
    await t.close();
  });

  const declare = (user: AuthUser, occurredOn: string, kg: number, causeCode: string) =>
    createDeclaration(
      t.db,
      user,
      {
        occurredOn,
        subzoneId: cuisine,
        product: { freeLabel: "Carottes", category: "matiere_premiere" },
        method: "pesee",
        quantity: kg,
        unitCode: "kg",
        causeId: cause[causeCode]!,
        destinations: [{ destinationId: compost, quantity: kg, binNumber: "1" }],
      },
      new Date(`${occurredOn}T12:00:00Z`),
    );

  it("signale l'équipe dont la même cause est en tête 3 semaines de suite", async () => {
    // Équipe C : « Erreur de préparation » en tête en S43, S44 et S45. Équipe A : la cause change en S44.
    for (const day of ["2026-10-16", "2026-10-23", "2026-10-30"]) {
      await declare(teamC, day, 6, "ERREUR_PREPARATION");
      await declare(teamC, day, 2, "NON_CONFORMITE_QUALITE");
    }
    await declare(teamA, "2026-10-16", 6, "ERREUR_PREPARATION");
    await declare(teamA, "2026-10-23", 6, "NON_CONFORMITE_QUALITE");
    await declare(teamA, "2026-10-30", 6, "ERREUR_PREPARATION");

    const result = await evaluateLossAlerts(t.db, { startDate: START, now: THURSDAY_S46 });
    expect(result).toMatchObject({ weeks: 3, created: 1 });
    const [alert, ...others] = await t.db.select().from(s.lossAlerts);
    expect(others).toEqual([]);
    expect(alert).toMatchObject({
      kind: "cause_recurrente",
      scope: "equipe",
      subjectKey: team.C,
      teamId: team.C,
      measure: "kg",
      value: 6,
      referenceWeeks: 3,
    });
    expect(alert!.details).toEqual({
      causeId: cause.ERREUR_PREPARATION,
      causeName: expect.any(String),
      weeks: [
        { week: "S43-2026", kg: 6, events: 1, share: 0.75 },
        { week: "S44-2026", kg: 6, events: 1, share: 0.75 },
        { week: "S45-2026", kg: 6, events: 1, share: 0.75 },
      ],
    });
  });

  it("ne remonte pas avant la mise en service", async () => {
    await t.db.delete(s.lossAlerts);
    expect(await evaluateLossAlerts(t.db, { startDate: "2026-10-22", now: THURSDAY_S46 })).toMatchObject({
      created: 0,
    });
  });
});
