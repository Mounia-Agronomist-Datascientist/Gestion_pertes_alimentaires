import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { setAccountZones } from "@/modules/admin/accounts";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { canModifyDeclaration } from "@/modules/declarations/access";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { listDeclarations } from "@/modules/declarations/queries";
import { createDeclaration } from "@/modules/declarations/service";
import { loadFacts } from "@/modules/statistiques/facts";
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

  describe("zones cochées par compte (décision du 19/11/2026)", () => {
    const WEEK = { kind: "periode", from: "2026-11-12", to: "2026-11-18" } as const;
    const NOW = new Date("2026-11-13T10:00:00Z");
    let teamRose: AuthUser;
    const loss = async (user: AuthUser, subzone: string, cause: string, dest: string, binNumber?: string) => {
      const id = async (table: typeof s.subzones | typeof s.causes | typeof s.destinations, code: string) =>
        (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;
      return createDeclaration(
        t.db,
        user,
        {
          occurredOn: "2026-11-12",
          subzoneId: await id(s.subzones, subzone),
          product: { freeLabel: "Essai", category: "matiere_premiere" },
          method: "pesee",
          quantity: 1,
          unitCode: "kg",
          causeId: await id(s.causes, cause),
          destinations: [{ destinationId: await id(s.destinations, dest), quantity: 1, binNumber }],
        },
        NOW,
      );
    };
    const reload = (u: AuthUser) => loadAuthUser(t.db, u.id);

    beforeAll(async () => {
      const team = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "C")))[0]!;
      teamRose = await loadAuthUser(
        t.db,
        await createAccount(t.db, {
          login: "equipe-c",
          displayName: "Équipe C",
          roleCode: "equipe",
          teamId: team.id,
          password: "mot-de-passe-equipe",
        }),
      );
    });

    it("une équipe n'a que Cuisine/production par défaut ; les autres zones sont grisées et refusées", async () => {
      expect(teamRose.zoneIds).toEqual([await zoneId("CUISINE")]);
      const options = await getDeclarationOptions(t.db, teamRose, "2026-11-12");
      expect(options.zones.filter((z) => z.allowed).map((z) => z.code)).toEqual(["CUISINE"]);
      expect(options.zones).toHaveLength(5);
      await expect(loss(teamRose, "REC_RECEPTION", "REC_CASSE_MANIP", "ALCHIMISTES", "1")).rejects.toThrow(
        /que dans vos zones/,
      );
      await loss(teamRose, "CUI_CUISINE", "ERREUR_PREPARATION", "PERSONNEL");
    });

    it("l'administration coche les zones ; historique et statistiques suivent les zones cochées", async () => {
      await setAccountZones(t.db, admin, teamRose.id, [await zoneId("CUISINE"), await zoneId("RECEPTION")]);
      teamRose = await reload(teamRose);
      const atReception = await loss(teamRose, "REC_RECEPTION", "REC_CASSE_MANIP", "ALCHIMISTES", "1");
      expect((await listDeclarations(t.db, teamRose)).map((d) => d.zoneName).sort()).toEqual(
        ["Cuisine / Production", "Réception"].sort(),
      );
      expect(await loadFacts(t.db, teamRose, WEEK)).toHaveLength(2);

      // Réception décochée : la perte n'est plus visible ni corrigeable par l'équipe, mais reste en base.
      await setAccountZones(t.db, admin, teamRose.id, [await zoneId("CUISINE")]);
      teamRose = await reload(teamRose);
      expect((await listDeclarations(t.db, teamRose)).map((d) => d.id)).not.toContain(atReception.id);
      expect(await loadFacts(t.db, teamRose, WEEK)).toHaveLength(1);
      const row = (await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, atReception.id)))[0]!;
      expect(canModifyDeclaration(teamRose, row, "2026-11-13")).toBe(false);
      expect(await loadFacts(t.db, admin, WEEK)).toHaveLength(2);
    });

    it("un profil qui compare les équipes ne voit que ses zones cochées", async () => {
      await setAccountZones(t.db, admin, admin.id, [await zoneId("RECEPTION")]);
      const limited = await reload(admin);
      expect((await loadFacts(t.db, limited, WEEK)).map((f) => f.zoneId)).toEqual([await zoneId("RECEPTION")]);
      expect((await getDeclarationOptions(t.db, limited, "2026-11-12")).zones.filter((z) => z.allowed)).toHaveLength(1);
      await setAccountZones(t.db, admin, admin.id, admin.zoneIds);
    });

    it("au moins une zone, des zones connues, et réservé à l'administration", async () => {
      await expect(setAccountZones(t.db, admin, teamRose.id, [])).rejects.toThrow(/au moins une zone/);
      await expect(setAccountZones(t.db, admin, teamRose.id, [crypto.randomUUID()])).rejects.toThrow(/inconnue/);
      await expect(setAccountZones(t.db, teamRose, teamRose.id, [await zoneId("PLONGE")])).rejects.toThrow(
        ForbiddenError,
      );
      const audit = await t.db.select().from(s.auditLog).where(eq(s.auditLog.action, "set_zones"));
      expect(audit.length).toBeGreaterThanOrEqual(3);
    });
  });
});
