import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createDestination, updateDestination } from "@/modules/admin/places";
import { listAuditActors, listAuditEntries } from "@/modules/audit/journal";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser, login } from "@/modules/auth/service";
import { createTestDb } from "../helpers/test-db";

describe("consultation du journal d'audit", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let production: AuthUser;
  let teamUser: AuthUser;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const teamC = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "C")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    production = await loadAuthUser(t.db, await createAccount(t.db, { login: "resp-production", displayName: "Responsable production", roleCode: "resp_production", password: "mot-de-passe-prod" }));
    teamUser = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-c", displayName: "Équipe C", roleCode: "equipe", teamId: teamC, password: "mot-de-passe-equipe" }));
    await login(t.db, { login: "admin", password: "mot-de-passe-admin" });
    const d = await createDestination(t.db, admin, { name: "Banque alimentaire", kind: "don" });
    await updateDestination(t.db, admin, d.id, { name: "Banque alimentaire locale", kind: "don" });
  });

  afterAll(async () => {
    await t.close();
  });

  it("affiche les dernières actions en premier, avec l'auteur et les champs modifiés", async () => {
    const { entries } = await listAuditEntries(t.db, admin, { entity: "destination" });
    expect(entries.map((e) => e.action)).toEqual(["update", "create"]);
    expect(entries[0]).toMatchObject({ userLogin: "admin", userName: "Administration", changes: ["name"] });
  });

  it("filtre par auteur et ne renvoie jamais d'empreinte de mot de passe", async () => {
    const actors = await listAuditActors(t.db, admin);
    expect(actors.map((a) => a.login)).toContain("admin");
    const { entries, total } = await listAuditEntries(t.db, admin, { userId: admin.id });
    expect(total).toBeGreaterThanOrEqual(3);
    expect(entries.every((e) => e.userLogin === "admin")).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/passwordHash|argon2/);
  });

  it("pagine et filtre par période", async () => {
    const all = await listAuditEntries(t.db, admin, {});
    expect(all.pageCount).toBe(Math.ceil(all.total / 50));
    const future = await listAuditEntries(t.db, admin, { days: 1 }, new Date("2030-01-01T00:00:00Z"));
    expect(future.total).toBe(0);
  });

  it("est lisible par l'administration et le compte responsable production, pas par les équipes", async () => {
    await expect(listAuditEntries(t.db, production, {})).resolves.toBeTruthy();
    await expect(listAuditEntries(t.db, teamUser, {})).rejects.toThrow(ForbiddenError);
  });
});
