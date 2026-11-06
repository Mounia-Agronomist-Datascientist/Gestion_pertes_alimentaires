import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed, zoneIdByCode } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import { PasswordPolicyError } from "@/modules/auth/password";
import { can, declarationReadScope } from "@/modules/auth/permissions";
import {
  changePassword,
  InvalidCurrentPasswordError,
  LOGIN_MAX_FAILURES,
  login,
  logout,
  revokeAllSessions,
  validateSession,
} from "@/modules/auth/service";
import { createTestDb } from "../helpers/test-db";

const PASSWORD = "mot-de-passe-test";
const DAY = 24 * 60 * 60 * 1000;

describe("authentification et droits", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let teamAId: string;
  let teamBId: string;
  let condZoneId: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const teams = await t.db.select().from(s.teams);
    teamAId = teams.find((x) => x.letter === "A")!.id;
    teamBId = teams.find((x) => x.letter === "B")!.id;
    condZoneId = await zoneIdByCode(t.db, "CONDITIONNEMENT");
    await createAccount(t.db, { login: "equipe-a", displayName: "Équipe A", roleCode: "equipe", teamId: teamAId, password: PASSWORD });
    await createAccount(t.db, { login: "equipe-b", displayName: "Équipe B", roleCode: "equipe", teamId: teamBId, password: PASSWORD });
    await createAccount(t.db, { login: "resp-cond", displayName: "Resp. conditionnement", roleCode: "resp_zone", zoneIds: [condZoneId], password: PASSWORD });
    await createAccount(t.db, { login: "admin", displayName: "Admin", roleCode: "admin", password: PASSWORD });
    await createAccount(t.db, { login: "direction", displayName: "Direction", roleCode: "direction", password: PASSWORD });
  });

  afterAll(async () => {
    await t.close();
  });

  describe("connexion", () => {
    it("connecte un compte équipe et charge son équipe, sans tenir compte de la casse de l'identifiant", async () => {
      const r = await login(t.db, { login: "  Equipe-A ", password: PASSWORD });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.user.team).toEqual({ letter: "A", colorName: "Bleue", colorHex: "#2563eb" });
      expect(r.token.length).toBeGreaterThan(40);
    });

    it("ne stocke jamais le jeton en clair", async () => {
      const r = await login(t.db, { login: "equipe-a", password: PASSWORD });
      if (!r.ok) throw new Error("connexion attendue");
      const rows = await t.db.select().from(s.sessions).where(eq(s.sessions.id, r.token));
      expect(rows).toHaveLength(0);
    });

    it("refuse un mauvais mot de passe ou un identifiant inconnu, avec le même message", async () => {
      expect(await login(t.db, { login: "equipe-a", password: "faux-mot-de-passe" })).toEqual({ ok: false, reason: "invalid" });
      expect(await login(t.db, { login: "inconnu", password: PASSWORD })).toEqual({ ok: false, reason: "invalid" });
    });

    it("bloque un identifiant après 5 échecs, sans bloquer les autres comptes", async () => {
      const now = new Date("2026-11-06T10:00:00Z");
      for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
        await login(t.db, { login: "equipe-b", password: "mauvais" }, { now });
      }
      expect(await login(t.db, { login: "equipe-b", password: PASSWORD }, { now })).toEqual({ ok: false, reason: "locked" });
      expect((await login(t.db, { login: "admin", password: PASSWORD }, { now })).ok).toBe(true);
      // 15 minutes plus tard, le compte est débloqué.
      const later = new Date(now.getTime() + 16 * 60 * 1000);
      expect((await login(t.db, { login: "equipe-b", password: PASSWORD }, { now: later })).ok).toBe(true);
    });

    it("journalise les connexions réussies et les échecs", async () => {
      const rows = await t.db
        .select()
        .from(s.auditLog)
        .where(and(eq(s.auditLog.entity, "user"), eq(s.auditLog.entityId, "equipe-b")));
      const actions = rows.map((r) => r.action);
      expect(actions).toContain("login_failed");
      expect(actions).toContain("login_blocked");
      expect(actions).toContain("login");
    });

    it("refuse un compte désactivé", async () => {
      await createAccount(t.db, { login: "ancien", displayName: "Ancien", roleCode: "admin", password: PASSWORD });
      await t.db.update(s.users).set({ active: false }).where(eq(s.users.login, "ancien"));
      expect((await login(t.db, { login: "ancien", password: PASSWORD })).ok).toBe(false);
    });
  });

  describe("sessions", () => {
    it("valide une session puis la ferme à la déconnexion", async () => {
      const r = await login(t.db, { login: "equipe-a", password: PASSWORD });
      if (!r.ok) throw new Error("connexion attendue");
      expect((await validateSession(t.db, r.token))?.user.login).toBe("equipe-a");
      await logout(t.db, r.token);
      expect(await validateSession(t.db, r.token)).toBeNull();
    });

    it("dure 30 jours pour un compte équipe, 12 h pour un administrateur", async () => {
      const now = new Date("2026-11-06T08:00:00Z");
      const team = await login(t.db, { login: "equipe-a", password: PASSWORD }, { now });
      const admin = await login(t.db, { login: "admin", password: PASSWORD }, { now });
      if (!team.ok || !admin.ok) throw new Error("connexion attendue");
      expect(team.expiresAt.getTime() - now.getTime()).toBe(30 * DAY);
      expect(admin.expiresAt.getTime() - now.getTime()).toBe(12 * 60 * 60 * 1000);
      expect(await validateSession(t.db, admin.token, new Date(now.getTime() + 13 * 60 * 60 * 1000))).toBeNull();
    });

    it("prolonge la session d'un appareil utilisé régulièrement", async () => {
      const now = new Date("2026-11-06T08:00:00Z");
      const r = await login(t.db, { login: "equipe-a", password: PASSWORD }, { now });
      if (!r.ok) throw new Error("connexion attendue");
      const day20 = new Date(now.getTime() + 20 * DAY);
      const v = await validateSession(t.db, r.token, day20);
      expect(v?.renewed).toBe(true);
      expect(v!.expiresAt.getTime()).toBe(day20.getTime() + 30 * DAY);
    });

    it("révoque toutes les sessions d'un compte", async () => {
      const r1 = await login(t.db, { login: "equipe-a", password: PASSWORD });
      const r2 = await login(t.db, { login: "equipe-a", password: PASSWORD });
      if (!r1.ok || !r2.ok) throw new Error("connexion attendue");
      await revokeAllSessions(t.db, r1.user.id, null, "test");
      expect(await validateSession(t.db, r1.token)).toBeNull();
      expect(await validateSession(t.db, r2.token)).toBeNull();
    });
  });

  describe("changement de mot de passe", () => {
    it("exige le mot de passe actuel, au moins 10 caractères, et ferme les autres appareils", async () => {
      const here = await login(t.db, { login: "direction", password: PASSWORD });
      const other = await login(t.db, { login: "direction", password: PASSWORD });
      if (!here.ok || !other.ok) throw new Error("connexion attendue");
      const id = here.user.id;
      expect(here.user.mustChangePassword).toBe(true);

      await expect(changePassword(t.db, id, { current: "faux", next: "nouveau-mot-de-passe" })).rejects.toThrow(InvalidCurrentPasswordError);
      await expect(changePassword(t.db, id, { current: PASSWORD, next: "court" })).rejects.toThrow(PasswordPolicyError);

      await changePassword(t.db, id, { current: PASSWORD, next: "nouveau-mot-de-passe" }, here.token);
      expect((await validateSession(t.db, here.token))?.user.mustChangePassword).toBe(false);
      expect(await validateSession(t.db, other.token)).toBeNull();
      expect((await login(t.db, { login: "direction", password: "nouveau-mot-de-passe" })).ok).toBe(true);
    });
  });

  describe("matrice d'autorisation et périmètres", () => {
    async function userOf(loginName: string) {
      const r = await login(t.db, { login: loginName, password: loginName === "direction" ? "nouveau-mot-de-passe" : PASSWORD });
      if (!r.ok) throw new Error(`connexion attendue pour ${loginName}`);
      return r.user;
    }

    it("une équipe ne lit que son équipe et ses propres saisies", async () => {
      const a = await userOf("equipe-a");
      expect(declarationReadScope(a)).toEqual({ kind: "team", teamId: teamAId, userId: a.id });
      expect(can(a, "declaration.read.all")).toBe(false);
      expect(can(a, "stats.compare_teams")).toBe(false);
      expect(can(a, "declaration.create")).toBe(true);
    });

    it("un responsable de zone est limité à ses zones", async () => {
      expect(declarationReadScope(await userOf("resp-cond"))).toEqual({ kind: "zones", zoneIds: [condZoneId] });
    });

    it("l'administrateur voit tout ; la direction consulte sans saisir", async () => {
      expect(declarationReadScope(await userOf("admin"))).toEqual({ kind: "all" });
      const direction = await userOf("direction");
      expect(can(direction, "declaration.create")).toBe(false);
      expect(can(direction, "indicators.read")).toBe(true);
      expect(declarationReadScope(direction)).toEqual({ kind: "none" });
    });
  });
});
