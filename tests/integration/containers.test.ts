import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { listContainersForAdmin, setContainerActive, setContainerMaxCount, setContainerTare } from "@/modules/admin/containers";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { createTestDb } from "../helpers/test-db";

describe("gastros et tares datées", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamUser: AuthUser;
  let gastro1: string;
  let gastro4: string;
  let cuisine: string;
  let cause: string;
  let compost: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const type = async (code: string) => (await t.db.select().from(s.containerTypes).where(eq(s.containerTypes.code, code)))[0]!.id;
    gastro1 = await type("GASTRO_1");
    gastro4 = await type("GASTRO_4");
    const teamC = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "C")))[0]!.id;
    cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")))[0]!.id;
    cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")))[0]!.id;
    compost = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamUser = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-c", displayName: "Équipe C", roleCode: "equipe", teamId: teamC, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  const declareWithGastro1 = (occurredOn: string, now: Date) =>
    createDeclaration(
      t.db,
      teamUser,
      {
        occurredOn,
        subzoneId: cuisine,
        product: { freeLabel: "Produit test", category: "sous_recette" },
        method: "pesee",
        tare: { grossKg: 12, gastros: [{ containerTypeId: gastro1, count: 2 }] },
        causeId: cause,
        destinations: [{ destinationId: compost, quantity: 1 }],
        destinationGapJustification: "Test",
      },
      now,
    );

  const versionsOf = async (typeId: string) =>
    (await listContainersForAdmin(t.db, admin, "2026-11-20")).find((c) => c.id === typeId)!.versions;

  it("liste les contenants avec la tare en vigueur", async () => {
    const list = await listContainersForAdmin(t.db, admin, "2026-11-09");
    expect(list.find((c) => c.code === "GASTRO_1")?.current?.unitTareKg).toBe(1.1);
    expect(list.find((c) => c.code === "ECHELLE_FOUR")?.current?.unitTareKg).toBe(52);
  });

  it("une nouvelle tare datée clôture la précédente la veille ; les déclarations passées gardent l'ancienne", async () => {
    const before = await declareWithGastro1("2026-11-09", new Date("2026-11-09T10:00:00Z"));
    await setContainerTare(t.db, admin, { containerTypeId: gastro1, unitTareKg: "1,2", validFrom: "2026-11-16", note: "Nouveaux gastros" });
    const [v2, v1] = await versionsOf(gastro1);
    expect(v2).toMatchObject({ unitTareKg: 1.2, validFrom: "2026-11-16", validTo: null, source: "Nouveaux gastros" });
    expect(v1).toMatchObject({ unitTareKg: 1.1, validTo: "2026-11-15" });

    const [old] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, before.id));
    expect(old?.tareTotalKg).toBe(2.2);
    const after = await declareWithGastro1("2026-11-16", new Date("2026-11-16T10:00:00Z"));
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, after.id));
    expect(row?.tareTotalKg).toBe(2.4);
    const options = await getDeclarationOptions(t.db, teamUser, "2026-11-16");
    expect(options.containers.find((c) => c.id === gastro1)?.unitTareKg).toBe(1.2);
  });

  it("corrige une tare jamais utilisée à la même date, mais refuse de réécrire une tare qui a servi ou une date antérieure", async () => {
    await setContainerTare(t.db, admin, { containerTypeId: gastro4, unitTareKg: "2,4", validFrom: "2026-12-03" });
    await setContainerTare(t.db, admin, { containerTypeId: gastro4, unitTareKg: "2,35", validFrom: "2026-12-03", note: "Erreur de saisie" });
    const versions = await versionsOf(gastro4);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ unitTareKg: 2.35, validFrom: "2026-12-03" });
    await expect(setContainerTare(t.db, admin, { containerTypeId: gastro4, unitTareKg: "2", validFrom: "2026-11-30" })).rejects.toThrow(/plus récente/);
    await expect(setContainerTare(t.db, admin, { containerTypeId: gastro1, unitTareKg: "1,3", validFrom: "2026-11-16" })).rejects.toThrow(/déjà servi/);
    await expect(setContainerTare(t.db, admin, { containerTypeId: gastro1, unitTareKg: "0", validFrom: "2026-12-20" })).rejects.toThrow(/positive/);
  });

  it("modifie le nombre maximum de gastros et désactive un contenant", async () => {
    await setContainerMaxCount(t.db, admin, gastro4, "25");
    await expect(setContainerMaxCount(t.db, admin, gastro4, "0")).rejects.toThrow(/invalide/);
    await setContainerActive(t.db, admin, gastro4, false);
    const [row] = await t.db.select().from(s.containerTypes).where(and(eq(s.containerTypes.id, gastro4)));
    expect(row).toMatchObject({ maxCount: 25, active: false });
    await setContainerActive(t.db, admin, gastro4, true);
  });

  it("réserve la gestion des tares à l'administration", async () => {
    await expect(setContainerTare(t.db, teamUser, { containerTypeId: gastro1, unitTareKg: "1", validFrom: "2027-01-01" })).rejects.toThrow(ForbiddenError);
    await expect(listContainersForAdmin(t.db, teamUser, "2026-11-09")).rejects.toThrow(ForbiddenError);
  });
});
