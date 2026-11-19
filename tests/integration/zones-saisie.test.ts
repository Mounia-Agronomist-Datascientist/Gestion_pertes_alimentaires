import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

describe("zones à la saisie : toutes visibles, numérotées, seules les siennes choisissables", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let respStockage: AuthUser;
  const zoneId = async (code: string) => (await t.db.select().from(s.zones).where(eq(s.zones.code, code)))[0]!.id;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    admin = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "admin",
        displayName: "Administration",
        roleCode: "admin",
        password: "mot-de-passe-admin",
      }),
    );
    respStockage = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "resp-stockage",
        displayName: "Responsable Stockage",
        roleCode: "resp_zone",
        password: "mot-de-passe-resp",
        zoneIds: [await zoneId("STOCKAGE")],
      }),
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it("numéros dans le sens de la marche en avant, les mêmes pour tous", async () => {
    const all = await getDeclarationOptions(t.db, admin, "2026-11-12");
    expect(all.zones.map((z) => [z.number, z.code, z.allowed])).toEqual([
      [1, "RECEPTION", true],
      [2, "STOCKAGE", true],
      [3, "CUISINE", true],
      [4, "CONDITIONNEMENT", true],
      [5, "PLONGE", true],
    ]);
    const mine = await getDeclarationOptions(t.db, respStockage, "2026-11-12");
    expect(mine.zones.map((z) => [z.number, z.code, z.allowed])).toEqual([
      [1, "RECEPTION", false],
      [2, "STOCKAGE", true],
      [3, "CUISINE", false],
      [4, "CONDITIONNEMENT", false],
      [5, "PLONGE", false],
    ]);
  });

  it("le serveur refuse une perte hors de ses zones", async () => {
    const reception = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "REC_RECEPTION")))[0]!.id;
    const cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "REC_CASSE_MANIP")))[0]!.id;
    const bin = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    await expect(
      createDeclaration(
        t.db,
        respStockage,
        {
          occurredOn: "2026-11-12",
          subzoneId: reception,
          product: { freeLabel: "Essai", category: "matiere_premiere" },
          method: "pesee",
          quantity: 1,
          unitCode: "kg",
          causeId: cause,
          destinations: [{ destinationId: bin, quantity: 1, binNumber: "1" }],
        },
        new Date("2026-11-13T10:00:00Z"),
      ),
    ).rejects.toThrow(/que dans vos zones/);
  });
});
