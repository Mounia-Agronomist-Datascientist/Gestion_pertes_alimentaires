import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { shareOfTotal } from "@/modules/statistiques/dashboard";
import { createTestDb } from "../helpers/test-db";

/** Part d'une équipe ou d'une zone dans les pertes (décision du 24/11/2026). */
describe("part dans les pertes : équipe de cuisine, responsable de zone", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamA: AuthUser;
  let stockage: AuthUser;
  const NOW = new Date("2026-11-13T10:00:00Z");
  const week = { kind: "semaine", year: 2026, number: 47 } as const;
  const id = async (table: typeof s.subzones | typeof s.causes | typeof s.destinations, code: string) =>
    (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;
  const team = async (letter: string) => (await t.db.select().from(s.teams).where(eq(s.teams.letter, letter)))[0]!.id;
  const zone = async (code: string) => (await t.db.select().from(s.zones).where(eq(s.zones.code, code)))[0]!.id;
  const loss = async (subzone: string, cause: string, kg: number, teamId: string | null = null) =>
    createDeclaration(
      t.db,
      admin,
      {
        occurredOn: "2026-11-12",
        subzoneId: await id(s.subzones, subzone),
        teamId,
        product: { freeLabel: "Produit test", category: "matiere_premiere" },
        method: "pesee",
        quantity: kg,
        unitCode: "kg",
        causeId: await id(s.causes, cause),
        destinations: [{ destinationId: await id(s.destinations, "ORDURES"), quantity: kg }],
      },
      NOW,
    );

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const account = async (login: string, roleCode: string, extra: object = {}) =>
      loadAuthUser(
        t.db,
        await createAccount(t.db, { login, displayName: login, roleCode, password: `mot-de-passe-${login}`, ...extra }),
      );
    admin = await account("admin", "admin");
    teamA = await account("equipe-a", "equipe", { teamId: await team("A") });
    stockage = await account("resp-stockage", "resp_zone", { zoneIds: [await zone("STOCKAGE")] });
    await loss("CUI_CUISINE", "CUI_CHUTE_GASTRO", 10, await team("A"));
    await loss("CUI_CUISINE", "CUI_CHUTE_GASTRO", 30, await team("B"));
    await loss("STO_BOF", "STO_PEREMPTION", 40);
    await loss("CON_BARQUETTES", "CON_ETIQUETAGE", 20);
  });

  afterAll(async () => {
    await t.close();
  });

  it("équipe : part dans sa zone, puis dans l'entreprise", async () => {
    const share = await shareOfTotal(t.db, teamA, week, {});
    expect(share).toMatchObject({ kind: "equipe", label: "Équipe A – Bleue" });
    expect([share!.own.foodKg, share!.zone!.summary.foodKg, share!.total.foodKg]).toEqual([10, 40, 100]);
    expect(share!.zone!.name).not.toMatch(/^\d/);
  });

  it("responsable de zone : part dans l'entreprise, toutes zones confondues", async () => {
    const share = await shareOfTotal(t.db, stockage, week, {});
    expect(share).toMatchObject({ kind: "zones", zone: null });
    expect([share!.own.foodKg, share!.total.foodKg]).toEqual([40, 100]);
  });

  it("les profils qui comparent les équipes gardent les pertes par zone", async () => {
    expect(await shareOfTotal(t.db, admin, week, {})).toBeNull();
  });
});
