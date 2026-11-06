import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed, zoneIdByCode } from "@/db/seed/seed";
import { createAccountByAdmin, listAccounts, resetPassword, setAccountActive } from "@/modules/admin/accounts";
import { listTeamsForWeek, setTeamWeekActive } from "@/modules/admin/teams";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser, login, validateSession } from "@/modules/auth/service";
import { createTestDb } from "../helpers/test-db";

describe("administration", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamUser: AuthUser;
  let teamH: string;
  let week: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    teamH = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "H")))[0]!.id;
    week = (await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 47))))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamUser = await loadAuthUser(
      t.db,
      await createAccount(t.db, { login: "equipe-h", displayName: "Chef d'équipe – Équipe Turquoise (H)", roleCode: "equipe", teamId: teamH, password: "mot-de-passe-equipe" }),
    );
  });

  afterAll(async () => {
    await t.close();
  });

  describe("comptes", () => {
    it("crée un compte avec un mot de passe provisoire à changer à la première connexion", async () => {
      const zone = await zoneIdByCode(t.db, "RECEPTION");
      const { password } = await createAccountByAdmin(t.db, admin, {
        login: "Resp-Reception",
        displayName: "Responsable Réception",
        roleCode: "resp_zone",
        zoneIds: [zone],
      });
      expect(password).toHaveLength(12);
      const r = await login(t.db, { login: "resp-reception", password });
      expect(r.ok && r.user.mustChangePassword).toBe(true);
      expect(r.ok && r.user.zoneIds).toEqual([zone]);
    });

    it("refuse un identifiant déjà pris, un compte équipe sans équipe, un responsable sans zone", async () => {
      await expect(createAccountByAdmin(t.db, admin, { login: "admin", displayName: "Doublon", roleCode: "admin" })).rejects.toThrow(/existe déjà/);
      await expect(createAccountByAdmin(t.db, admin, { login: "equipe-x", displayName: "Équipe X", roleCode: "equipe" })).rejects.toThrow(/équipe/);
      await expect(createAccountByAdmin(t.db, admin, { login: "resp-x", displayName: "Responsable X", roleCode: "resp_zone" })).rejects.toThrow(/zone/);
    });

    it("réinitialise un mot de passe et déconnecte tous les appareils du compte", async () => {
      const session = await login(t.db, { login: "equipe-h", password: "mot-de-passe-equipe" });
      if (!session.ok) throw new Error("connexion attendue");
      const newPassword = await resetPassword(t.db, admin, teamUser.id);
      expect(await validateSession(t.db, session.token)).toBeNull();
      expect((await login(t.db, { login: "equipe-h", password: "mot-de-passe-equipe" })).ok).toBe(false);
      expect((await login(t.db, { login: "equipe-h", password: newPassword })).ok).toBe(true);
    });

    it("désactive un compte sans le supprimer, et l'administrateur ne peut pas se désactiver lui-même", async () => {
      await setAccountActive(t.db, admin, teamUser.id, false);
      expect((await login(t.db, { login: "equipe-h", password: "x".repeat(12) })).ok).toBe(false);
      const accounts = await listAccounts(t.db, admin);
      expect(accounts.find((a) => a.login === "equipe-h")).toMatchObject({ active: false, teamLetter: "H" });
      await setAccountActive(t.db, admin, teamUser.id, true);
      await expect(setAccountActive(t.db, admin, admin.id, false)).rejects.toThrow(/propre compte/);
    });

    it("réserve la gestion des comptes à l'administrateur", async () => {
      await expect(listAccounts(t.db, teamUser)).rejects.toThrow(ForbiddenError);
      await expect(resetPassword(t.db, teamUser, admin.id)).rejects.toThrow(ForbiddenError);
    });

    it("journalise les opérations sur les comptes", async () => {
      const actions = (await t.db.select().from(s.auditLog).where(eq(s.auditLog.entity, "user"))).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["create", "password_reset", "deactivate", "activate", "sessions_revoked"]));
    });
  });

  describe("équipes inactives pour une semaine", () => {
    it("désactive puis réactive une équipe pour une semaine, sans la supprimer", async () => {
      await setTeamWeekActive(t.db, admin, { teamId: teamH, productionWeekId: week, active: false, note: "Période creuse" });
      let teams = await listTeamsForWeek(t.db, admin, week);
      expect(teams.find((x) => x.letter === "H")).toMatchObject({ activeThisWeek: false, note: "Période creuse" });
      expect(teams).toHaveLength(8);
      await setTeamWeekActive(t.db, admin, { teamId: teamH, productionWeekId: week, active: true });
      teams = await listTeamsForWeek(t.db, admin, week);
      expect(teams.find((x) => x.letter === "H")?.activeThisWeek).toBe(true);
    });
  });
});
