import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { cancelAlert, evaluateMissingDeclarations, listAlerts } from "@/modules/alertes/service";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

// S46-2026 : jeudi 05/11 → mercredi 11/11. Plages : 05-06/11 et 09-11/11.
const START = "2026-11-05";
const SATURDAY = new Date("2026-11-07T10:00:00Z"); // plage jeudi-vendredi terminée
const THURSDAY_S47 = new Date("2026-11-12T10:00:00Z"); // les deux plages de S46 sont terminées

describe("alerte « rien de noté »", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  const team: Record<string, string> = {};
  let teamC: AuthUser;
  let teamA: AuthUser;
  let admin: AuthUser;
  let cuisine: string;
  let cause: string;
  let compost: string;
  let condBarquettes: string;
  let condCause: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    for (const r of await t.db.select().from(s.teams)) team[r.letter] = r.id;
    cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")))[0]!.id;
    condBarquettes = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CON_BARQUETTES")))[0]!.id;
    cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")))[0]!.id;
    condCause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "CON_SCELLAGE")))[0]!.id;
    compost = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    const mk = async (login: string, roleCode: string, teamId?: string) =>
      loadAuthUser(t.db, await createAccount(t.db, { login, displayName: login, roleCode, teamId, password: "mot-de-passe-test" }));
    teamC = await mk("equipe-c", "equipe", team.C);
    teamA = await mk("equipe-a", "equipe", team.A);
    admin = await mk("admin", "admin");
  });

  beforeEach(async () => {
    await t.db.delete(s.missingDeclarationAlerts);
  });

  afterAll(async () => {
    await t.close();
  });

  const declare = (user: AuthUser, occurredOn: string, now: Date, subzoneId = cuisine, causeId = cause) =>
    createDeclaration(
      t.db,
      user,
      {
        occurredOn,
        subzoneId,
        product: { freeLabel: "Produit test", category: "sous_recette" },
        method: "pesee",
        quantity: 1,
        unitCode: "kg",
        causeId,
        destinations: [{ destinationId: compost, quantity: 1 }],
      },
      now,
    );

  const alertsOf = async (letter: string) =>
    t.db.select().from(s.missingDeclarationAlerts).where(eq(s.missingDeclarationAlerts.teamId, team[letter]!));

  it("n'évalue rien tant que la date de mise en service n'est pas fixée", async () => {
    expect(await evaluateMissingDeclarations(t.db, { startDate: null, now: THURSDAY_S47 })).toEqual({ created: 0, regularized: 0 });
  });

  it("attribue 150 kg à chaque équipe sans déclaration sur une plage terminée, et seulement une fois", async () => {
    const first = await evaluateMissingDeclarations(t.db, { startDate: START, now: SATURDAY });
    expect(first.created).toBe(8); // 8 équipes × plage jeudi-vendredi
    const again = await evaluateMissingDeclarations(t.db, { startDate: START, now: SATURDAY });
    expect(again.created).toBe(0);
    const [alert] = await alertsOf("C");
    expect(alert).toMatchObject({ window: "jeudi_vendredi", firstDay: "2026-11-05", lastDay: "2026-11-06", estimatedKg: 150, status: "active" });
  });

  it("ne contrôle pas une plage qui n'est pas terminée", async () => {
    await evaluateMissingDeclarations(t.db, { startDate: START, now: SATURDAY });
    expect((await alertsOf("C")).map((a) => a.window)).toEqual(["jeudi_vendredi"]);
  });

  it("une seule déclaration sur la plage suffit ; une semaine vide coûte 2 × 150 kg", async () => {
    await declare(teamC, "2026-11-10", THURSDAY_S47); // mardi : plage lundi-mercredi couverte
    await evaluateMissingDeclarations(t.db, { startDate: START, now: THURSDAY_S47 });
    expect((await alertsOf("C")).map((a) => a.window)).toEqual(["jeudi_vendredi"]);
    expect((await alertsOf("A")).map((a) => a.window).sort()).toEqual(["jeudi_vendredi", "lundi_mercredi"]);
  });

  it("une perte saisie hors cuisine par le compte de l'équipe compte aussi", async () => {
    await declare(teamA, "2026-11-06", THURSDAY_S47, condBarquettes, condCause);
    await evaluateMissingDeclarations(t.db, { startDate: START, now: THURSDAY_S47 });
    expect((await alertsOf("A")).map((a) => a.window)).not.toContain("jeudi_vendredi");
  });

  it("une déclaration tardive (dans le délai) régularise l'alerte, qui reste dans l'historique", async () => {
    await evaluateMissingDeclarations(t.db, { startDate: START, now: SATURDAY });
    await declare(teamC, "2026-11-05", new Date("2026-11-09T09:00:00Z"));
    const r = await evaluateMissingDeclarations(t.db, { startDate: START, now: new Date("2026-11-09T10:00:00Z") });
    expect(r.regularized).toBeGreaterThanOrEqual(1);
    const [alert] = (await alertsOf("C")).filter((a) => a.window === "jeudi_vendredi");
    expect(alert?.status).toBe("regularisee");
  });

  it("ignore une équipe désactivée pour la semaine et les plages avant la mise en service", async () => {
    const [s46] = await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 46)));
    await t.db.insert(s.teamWeekStatus).values({ teamId: team.H!, productionWeekId: s46!.id, active: false }).onConflictDoNothing();
    await evaluateMissingDeclarations(t.db, { startDate: START, now: SATURDAY });
    expect(await alertsOf("H")).toHaveLength(0);
    await t.db.delete(s.missingDeclarationAlerts);
    expect((await evaluateMissingDeclarations(t.db, { startDate: "2026-11-09", now: SATURDAY })).created).toBe(0);
  });

  it("tient compte des jours non travaillés (jour férié)", async () => {
    await t.db.update(s.productionDays).set({ isProductionDay: false }).where(eq(s.productionDays.day, "2026-11-06"));
    await evaluateMissingDeclarations(t.db, { startDate: START, now: SATURDAY });
    expect((await alertsOf("B"))[0]).toMatchObject({ firstDay: "2026-11-05", lastDay: "2026-11-05" });
    await t.db.update(s.productionDays).set({ isProductionDay: true }).where(eq(s.productionDays.day, "2026-11-06"));
  });

  it("chaque équipe ne voit que ses alertes ; l'administratrice voit tout et peut lever une alerte avec motif", async () => {
    await evaluateMissingDeclarations(t.db, { startDate: START, now: new Date("2026-11-08T10:00:00Z") });
    await t.db.insert(s.missingDeclarationAlerts).values({
      teamId: team.C!,
      productionWeekId: (await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 45))))[0]!.id,
      window: "lundi_mercredi",
      firstDay: "2026-11-02",
      lastDay: "2026-11-04",
      estimatedKg: 150,
    });
    const mine = await listAlerts(t.db, teamC);
    expect(mine.every((a) => a.teamLetter === "C")).toBe(true);
    const all = await listAlerts(t.db, admin);
    expect(all).toHaveLength(await t.db.$count(s.missingDeclarationAlerts));
    expect(new Set(all.map((a) => a.teamLetter)).size).toBeGreaterThan(1);

    await expect(cancelAlert(t.db, teamC, mine[0]!.id, "Absente")).rejects.toThrow(ForbiddenError);
    await expect(cancelAlert(t.db, admin, mine[0]!.id, " ")).rejects.toThrow(/motif/);
    await cancelAlert(t.db, admin, mine[0]!.id, "Équipe en formation ce jour-là");
    expect(await listAlerts(t.db, teamC, { onlyActive: true })).toHaveLength(0);
  });
});
