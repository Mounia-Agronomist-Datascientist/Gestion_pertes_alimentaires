import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed, zoneIdByCode } from "@/db/seed/seed";
import { createAccountByAdmin, listAccounts, resetPassword, setAccountActive } from "@/modules/admin/accounts";
import {
  countPendingProposals,
  createCause,
  listCausesForAdmin,
  proposeCause,
  reviewCause,
  setCauseActive,
  updateCause,
} from "@/modules/admin/causes";
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

describe("causes", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let team: AuthUser;
  let cuisine: string;
  let plonge: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    cuisine = await zoneIdByCode(t.db, "CUISINE");
    plonge = await zoneIdByCode(t.db, "PLONGE");
    const teamA = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "A")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    team = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-a", displayName: "Équipe A", roleCode: "equipe", teamId: teamA, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  const activeCauseNames = async (zoneId: string) => {
    const rows = await t.db
      .select({ name: s.causes.name })
      .from(s.causes)
      .innerJoin(s.causeZones, eq(s.causeZones.causeId, s.causes.id))
      .where(and(eq(s.causeZones.zoneId, zoneId), eq(s.causes.status, "active")));
    return rows.map((r) => r.name);
  };

  it("une proposition n'apparaît dans les listes qu'après validation", async () => {
    const proposed = await proposeCause(t.db, team, { name: "Bac renversé au transport", zoneId: cuisine });
    expect(proposed.status).toBe("proposee");
    expect(await activeCauseNames(cuisine)).not.toContain("Bac renversé au transport");
    expect(await countPendingProposals(t.db)).toBe(1);

    await reviewCause(t.db, admin, proposed.id, { accept: true, name: "Bac renversé pendant le transport", zoneIds: [cuisine, plonge] });
    expect(await activeCauseNames(cuisine)).toContain("Bac renversé pendant le transport");
    expect(await activeCauseNames(plonge)).toContain("Bac renversé pendant le transport");
    expect(await countPendingProposals(t.db)).toBe(0);
  });

  it("refuse les doublons de formulation (accents, casse, ponctuation)", async () => {
    await expect(proposeCause(t.db, team, { name: "erreur de PREPARATION !", zoneId: cuisine })).rejects.toThrow(/existe déjà/);
  });

  it("une proposition rejetée ne bloque pas une nouvelle proposition du même nom", async () => {
    const p = await proposeCause(t.db, team, { name: "Coupure de courant", zoneId: cuisine });
    await reviewCause(t.db, admin, p.id, { accept: false, reason: "Utiliser « Autres pertes »" });
    expect((await t.db.select().from(s.causes).where(eq(s.causes.id, p.id)))[0]?.status).toBe("rejetee");
    await expect(proposeCause(t.db, team, { name: "Coupure de courant", zoneId: cuisine })).resolves.toBeTruthy();
  });

  it("désactive une cause, mais jamais « Autres pertes »", async () => {
    const causes = await listCausesForAdmin(t.db, admin);
    const other = causes.find((c) => c.isOther)!;
    const four = causes.find((c) => c.code === "CUI_FOUR_SALE")!;
    await expect(setCauseActive(t.db, admin, other.id, false)).rejects.toThrow(/toujours/);
    await setCauseActive(t.db, admin, four.id, false);
    expect(await activeCauseNames(cuisine)).not.toContain(four.name);
  });

  it("renommer une cause ne change pas les déclarations passées (nom conservé à la saisie)", async () => {
    const created = await createCause(t.db, admin, { name: "Cause temporaire", zoneIds: [cuisine] });
    await updateCause(t.db, admin, created.id, { name: "Cause renommée", zoneIds: [cuisine] });
    const [row] = await t.db.select().from(s.causes).where(eq(s.causes.id, created.id));
    expect(row?.name).toBe("Cause renommée");
  });

  it("réserve la gestion et la validation à l'administrateur", async () => {
    await expect(listCausesForAdmin(t.db, team)).rejects.toThrow(ForbiddenError);
    await expect(createCause(t.db, team, { name: "Test", zoneIds: [cuisine] })).rejects.toThrow(ForbiddenError);
  });
});
