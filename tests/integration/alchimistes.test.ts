import { asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
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
});
