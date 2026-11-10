import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed, zoneIdByCode } from "@/db/seed/seed";
import { listLabourRates, setLabourRate } from "@/modules/admin/labour";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createTestDb } from "../helpers/test-db";

describe("coûts horaires de main-d'œuvre par zone", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamUser: AuthUser;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const teamC = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "C")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamUser = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-c", displayName: "Équipe C", roleCode: "equipe", teamId: teamC, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  it("enregistre un taux daté par zone, clôture le précédent la veille, garde l'historique", async () => {
    const cuisine = await zoneIdByCode(t.db, "CUISINE");
    await setLabourRate(t.db, admin, cuisine, { hourlyCostEur: "28,50", validFrom: "2026-11-01" }, "2026-11-01");
    await setLabourRate(t.db, admin, cuisine, { hourlyCostEur: "29", validFrom: "2027-01-01", note: "Revalorisation" }, "2026-11-10");
    const zone = (await listLabourRates(t.db, admin, "2026-11-10")).find((z) => z.id === cuisine)!;
    expect(zone.current).toMatchObject({ hourlyCostEur: 28.5, unit: "heure", validTo: "2026-12-31" });
    expect(zone.versions.map((v) => v.hourlyCostEur)).toEqual([29, 28.5]);
    await expect(setLabourRate(t.db, admin, cuisine, { hourlyCostEur: "30", validFrom: "2026-11-01" }, "2026-11-10")).rejects.toThrow(/plus récente/);
  });

  it("réserve la saisie à l'administration", async () => {
    await expect(listLabourRates(t.db, teamUser, "2026-11-10")).rejects.toThrow(ForbiddenError);
  });
});
