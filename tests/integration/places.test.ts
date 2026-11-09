import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed, zoneIdByCode } from "@/db/seed/seed";
import {
  createDestination,
  createSubzone,
  listDestinationsForAdmin,
  listZonesForAdmin,
  moveDestination,
  moveSubzone,
  renameZone,
  setDestinationActive,
  setSubzoneActive,
  updateDestination,
  updateSubzone,
} from "@/modules/admin/places";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

describe("destinations, zones et postes", () => {
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

  const idOf = async (code: string) => (await t.db.select().from(s.destinations).where(eq(s.destinations.code, code)))[0]!.id;

  describe("destinations", () => {
    it("crée une destination à la fin de la liste ; refuse un doublon et une recette hors vente", async () => {
      const d = await createDestination(t.db, admin, { name: "Banque alimentaire", kind: "don" });
      expect(d).toMatchObject({ code: "ADM_BANQUE_ALIMENTAIRE", financialRecovery: false, active: true });
      const list = await listDestinationsForAdmin(t.db, admin);
      expect(list.at(-1)?.id).toBe(d.id);
      await expect(createDestination(t.db, admin, { name: "banque ALIMENTAIRE", kind: "don" })).rejects.toThrow(/existe déjà/);
      await expect(createDestination(t.db, admin, { name: "Don payant", kind: "don", financialRecovery: true })).rejects.toThrow(/vente/);
    });

    it("le type d'une destination déjà utilisée ne change plus, son nom peut être reformulé", async () => {
      const cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")))[0]!.id;
      const cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")))[0]!.id;
      const personnel = await idOf("PERSONNEL");
      await createDeclaration(
        t.db,
        teamUser,
        {
          occurredOn: "2026-11-09",
          subzoneId: cuisine,
          product: { freeLabel: "Produit test", category: "sous_recette" },
          method: "pesee",
          quantity: 1,
          unitCode: "kg",
          causeId: cause,
          destinations: [{ destinationId: personnel, quantity: 1 }],
        },
        new Date("2026-11-09T10:00:00Z"),
      );
      await expect(updateDestination(t.db, admin, personnel, { name: "Personnel", kind: "vente" })).rejects.toThrow(/déjà utilisée/);
      await updateDestination(t.db, admin, personnel, { name: "Repas du personnel", kind: "personnel" });
      expect((await listDestinationsForAdmin(t.db, admin)).find((d) => d.id === personnel)).toMatchObject({ name: "Repas du personnel", used: true });
    });

    it("désactive (plus proposée à la saisie) et réordonne", async () => {
      const flash = await idOf("VENTE_FLASH");
      await setDestinationActive(t.db, admin, flash, false);
      const options = await getDeclarationOptions(t.db, teamUser, "2026-11-09");
      expect(options.destinations.map((d) => d.id)).not.toContain(flash);
      await setDestinationActive(t.db, admin, flash, true);

      const before = (await listDestinationsForAdmin(t.db, admin)).map((d) => d.id);
      await moveDestination(t.db, admin, before[1]!, "up");
      const after = (await listDestinationsForAdmin(t.db, admin)).map((d) => d.id);
      expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
      await moveDestination(t.db, admin, after[0]!, "up"); // déjà en tête : rien ne change
      expect((await listDestinationsForAdmin(t.db, admin)).map((d) => d.id)).toEqual(after);
    });
  });

  describe("zones et postes", () => {
    it("un nouveau poste reprend le mode d'attribution de sa zone", async () => {
      const cuisineZone = await zoneIdByCode(t.db, "CUISINE");
      const plonge = await zoneIdByCode(t.db, "PLONGE");
      const a = await createSubzone(t.db, admin, cuisineZone, { name: "Poste pâtisserie", description: "" });
      expect(a).toMatchObject({ teamMode: "equipe", description: null, code: "ADM_POSTE_PATISSERIE" });
      const b = await createSubzone(t.db, admin, plonge, { name: "Plonge batterie" });
      expect(b.teamMode).toBe("zone");
      await expect(createSubzone(t.db, admin, plonge, { name: "plonge BATTERIE" })).rejects.toThrow(/existe déjà/);
      const options = await getDeclarationOptions(t.db, teamUser, "2026-11-09");
      expect(options.zones.find((z) => z.id === cuisineZone)?.subzones.map((sz) => sz.id)).toContain(a.id);
    });

    it("renomme une zone et un poste, réordonne, et garde au moins un poste actif par zone", async () => {
      const reception = await zoneIdByCode(t.db, "RECEPTION");
      await renameZone(t.db, admin, reception, "Réception marchandises");
      await expect(renameZone(t.db, admin, reception, "Stockage")).rejects.toThrow(/existe déjà/);
      const zone = (await listZonesForAdmin(t.db, admin)).find((z) => z.id === reception)!;
      expect(zone.name).toBe("Réception marchandises");
      const [first, second] = zone.subzones;
      await updateSubzone(t.db, admin, first!.id, { name: "Quai de réception", description: "Déchargement" });
      await moveSubzone(t.db, admin, second!.id, "up");
      const reordered = (await listZonesForAdmin(t.db, admin)).find((z) => z.id === reception)!.subzones;
      expect(reordered.map((sz) => sz.id).slice(0, 2)).toEqual([second!.id, first!.id]);
      expect(reordered[1]).toMatchObject({ name: "Quai de réception", description: "Déchargement" });

      await setSubzoneActive(t.db, admin, first!.id, false);
      await expect(setSubzoneActive(t.db, admin, second!.id, false)).rejects.toThrow(/au moins un poste/);
      await setSubzoneActive(t.db, admin, first!.id, true);
    });

    it("réserve ces réglages à l'administration", async () => {
      await expect(createDestination(t.db, teamUser, { name: "X dest", kind: "autre" })).rejects.toThrow(ForbiddenError);
      await expect(listZonesForAdmin(t.db, teamUser)).rejects.toThrow(ForbiddenError);
    });
  });
});
