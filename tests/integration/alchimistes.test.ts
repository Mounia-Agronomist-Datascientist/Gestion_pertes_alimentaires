import { asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { alchimistesReconciliation } from "@/modules/statistiques/alchimistes";
import { type AlchimistesPayload, alchimistesCoverage, listAlchimistesImports, saveAlchimistesImport } from "@/modules/imports/alchimistes/service";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-12T10:00:00Z");

const collection = (date: string, netKg: number) => ({ date, netKg, containerType: "120L biofiltre", containerNumber: null, quality: 3, incident: null, material: "Déchets en vrac", fileWeek: null });
const payload = (periodFrom: string, periodTo: string, collections: ReturnType<typeof collection>[]): AlchimistesPayload => ({
  fileName: "alchimistes.csv",
  periodFrom,
  periodTo,
  deliveries: 1,
  collections,
  warnings: [],
});

describe("pesées des Alchimistes", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let team: AuthUser;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    const [teamD] = await t.db.select().from(s.teams).where(eq(s.teams.letter, "D"));
    team = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: teamD!.id, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  const inForce = () =>
    t.db
      .select({ date: s.alchimistesCollections.collectedOn, kg: s.alchimistesCollections.netKg, week: s.productionWeeks.number })
      .from(s.alchimistesCollections)
      .innerJoin(s.productionWeeks, eq(s.productionWeeks.id, s.alchimistesCollections.productionWeekId))
      .where(isNull(s.alchimistesCollections.replacedByImportId))
      .orderBy(asc(s.alchimistesCollections.collectedOn), asc(s.alchimistesCollections.netKg));

  it("enregistre les collectes avec la semaine de production du calendrier (jeudi → mercredi)", async () => {
    const saved = await saveAlchimistesImport(t.db, admin, payload("2026-04-30", "2026-05-07", [collection("2026-04-30", 21.4), collection("2026-04-30", 21.4), collection("2026-05-06", 48), collection("2026-05-07", 30)]), NOW);
    expect(saved).toMatchObject({ collections: 4, totalKg: 120.8, replaced: 0 });
    expect(await inForce()).toEqual([
      { date: "2026-04-30", kg: 21.4, week: 19 },
      { date: "2026-04-30", kg: 21.4, week: 19 },
      { date: "2026-05-06", kg: 48, week: 19 },
      { date: "2026-05-07", kg: 30, week: 20 },
    ]);
  });

  it("un nouveau fichier remplace les collectes de sa période, sans rien effacer", async () => {
    const saved = await saveAlchimistesImport(t.db, admin, payload("2026-05-06", "2026-05-13", [collection("2026-05-06", 50), collection("2026-05-13", 12)]), new Date("2026-11-12T11:00:00Z"));
    expect(saved.replaced).toBe(2);
    expect((await inForce()).map((c) => [c.date, c.kg])).toEqual([
      ["2026-04-30", 21.4],
      ["2026-04-30", 21.4],
      ["2026-05-06", 50],
      ["2026-05-13", 12],
    ]);
    expect(await t.db.select().from(s.alchimistesCollections)).toHaveLength(6);
    expect(await alchimistesCoverage(t.db, admin)).toEqual(["2026-04-30", "2026-05-06", "2026-05-13"]);
    const list = await listAlchimistesImports(t.db, admin);
    expect(list.map((i) => i.collections)).toEqual([2, 4]);
    const [audit] = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, saved.id));
    expect(audit?.reason).toBe("Remplace 2 collectes de la période");
  });

  it("refuse une date hors calendrier et un compte sans droit", async () => {
    await expect(saveAlchimistesImport(t.db, admin, payload("1990-01-04", "1990-01-04", [collection("1990-01-04", 1)]), NOW)).rejects.toThrow(/hors du calendrier/);
    await expect(saveAlchimistesImport(t.db, team, payload("2026-05-06", "2026-05-06", [collection("2026-05-06", 1)]), NOW)).rejects.toThrow();
  });

  it("rapproche les kg déclarés vers Les Alchimistes et les kg pesés, par semaine et par mois", async () => {
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    const subzoneId = await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")));
    const causeId = await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")));
    const alc = await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")));
    const ordures = await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ORDURES")));
    const declare = (occurredOn: string, quantity: number, destinations: object[]) =>
      createDeclaration(
        t.db,
        team,
        { occurredOn, subzoneId, product: { freeLabel: "Carottes", category: "matiere_premiere" }, method: "pesee", quantity, unitCode: "kg", causeId, destinations },
        new Date(`${occurredOn}T14:00:00Z`),
      );
    // S45 (jeudi 29/10 → mercredi 04/11) : 2 kg puis 3 kg dont 1 kg aux ordures ; S46 : 1 kg, sans fichier.
    await declare("2026-11-02", 2, [{ destinationId: alc, quantity: 2 }]);
    await declare("2026-11-03", 3, [
      { destinationId: alc, quantity: 2 },
      { destinationId: ordures, quantity: 1 },
    ]);
    await declare("2026-11-06", 1, [{ destinationId: alc, quantity: 1 }]);
    await saveAlchimistesImport(t.db, admin, payload("2026-10-29", "2026-11-04", [collection("2026-10-29", 6.5), collection("2026-11-02", 3.5)]), new Date("2026-11-12T12:00:00Z"));

    const r = (await alchimistesReconciliation(t.db, admin, { year: 2026, number: 46 }))!;
    expect(r.weeks).toHaveLength(12);
    const [s45, s46] = r.weeks.slice(-2);
    expect(s45).toMatchObject({ label: "S45-2026", declaredKg: 4, declaredLines: 2, measuredKg: 10, bins: 2, status: "rapproche", gapKg: 6, gapRate: 0.6 });
    expect(s46).toMatchObject({ label: "S46-2026", declaredKg: 1, status: "sans_fichier", gapKg: null });
    expect(r.weeksTotal).toMatchObject({ periods: 1, declaredKg: 4, measuredKg: 10 });
    // Par mois : la collecte du 29/10 compte en octobre, les déclarations de novembre en novembre.
    const [october, november] = r.months.slice(-2);
    expect(october).toMatchObject({ label: "10/2026", declaredKg: 0, measuredKg: 6.5, status: "sans_declaration" });
    expect(november).toMatchObject({ label: "11/2026", declaredKg: 5, measuredKg: 3.5, gapKg: -1.5 });
    await expect(alchimistesReconciliation(t.db, team, { year: 2026, number: 46 })).rejects.toThrow();
  });
});
