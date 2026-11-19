/**
 * Gestion des comptes par l'administrateur (permission « user.manage »).
 * Les mots de passe générés sont renvoyés une seule fois pour être communiqués ; seul leur hachage est stocké.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { accountExists, createAccount } from "@/modules/auth/accounts";
import { generatePassword, hashPassword } from "@/modules/auth/password";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { revokeAllSessions } from "@/modules/auth/service";

export class AdminError extends Error {}

export async function listAccounts(db: Db, admin: AuthUser) {
  requirePermission(admin, "user.manage");
  const [rows, zoneLinks, roles] = await Promise.all([
    db
      .select({
        id: s.users.id,
        login: s.users.login,
        displayName: s.users.displayName,
        roleCode: s.users.roleCode,
        active: s.users.active,
        mustChangePassword: s.users.mustChangePassword,
        lastLoginAt: s.users.lastLoginAt,
        teamLetter: s.teams.letter,
        teamColorHex: s.teams.colorHex,
      })
      .from(s.users)
      .leftJoin(s.teams, eq(s.users.teamId, s.teams.id))
      .orderBy(asc(s.users.roleCode), asc(s.users.login)),
    db
      .select({ userId: s.userZones.userId, zoneId: s.zones.id, zoneName: s.zones.name })
      .from(s.userZones)
      .innerJoin(s.zones, eq(s.userZones.zoneId, s.zones.id))
      .orderBy(asc(s.zones.displayOrder)),
    db.select().from(s.roles),
  ]);
  const roleLabel = new Map(roles.map((r) => [r.code, r.label]));
  return rows.map((r) => ({
    ...r,
    roleLabel: roleLabel.get(r.roleCode) ?? r.roleCode,
    zones: zoneLinks.filter((z) => z.userId === r.id).map((z) => z.zoneName),
    zoneIds: zoneLinks.filter((z) => z.userId === r.id).map((z) => z.zoneId),
  }));
}

export const newAccountSchema = z
  .object({
    login: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{2,39}$/, "Identifiant : 3 à 40 caractères, lettres minuscules, chiffres et tirets"),
    displayName: z.string().trim().min(3, "Indiquez un intitulé (ex. « Responsable Réception »)").max(80),
    roleCode: z.enum(["equipe", "resp_zone", "resp_production", "admin", "direction"]),
    teamId: z.uuid().nullable().optional(),
    zoneIds: z.array(z.uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.roleCode === "equipe" && !v.teamId)
      ctx.addIssue({ code: "custom", message: "Choisissez l'équipe du compte" });
    if (v.roleCode !== "equipe" && v.teamId)
      ctx.addIssue({ code: "custom", message: "Seul un compte équipe est rattaché à une équipe" });
    if (v.zoneIds.length === 0) ctx.addIssue({ code: "custom", message: "Cochez au moins une zone" });
  });

/** Crée un compte avec un mot de passe provisoire, à changer à la première connexion. */
export async function createAccountByAdmin(
  db: Db,
  admin: AuthUser,
  raw: unknown,
): Promise<{ id: string; password: string }> {
  requirePermission(admin, "user.manage");
  const parsed = newAccountSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const input = parsed.data;
  if (await accountExists(db, input.login)) throw new AdminError("Cet identifiant existe déjà");

  const password = generatePassword();
  const id = await createAccount(
    db,
    {
      login: input.login,
      displayName: input.displayName,
      roleCode: input.roleCode,
      teamId: input.roleCode === "equipe" ? input.teamId : null,
      zoneIds: input.zoneIds,
      password,
      mustChangePassword: true,
    },
    admin.id,
  );
  return { id, password };
}

/**
 * Zones cochées d'un compte (décision du 19/11/2026) : il ne saisit et ne voit les pertes que de ces zones. Au moins
 * une zone ; seules les zones actives sont acceptées. Effet à la page suivante du compte (droits relus à chaque page).
 */
export async function setAccountZones(db: Db, admin: AuthUser, userId: string, raw: unknown): Promise<void> {
  requirePermission(admin, "user.manage");
  const parsed = z.array(z.uuid()).max(50).safeParse(raw);
  if (!parsed.success) throw new AdminError("Zones illisibles");
  const zoneIds = [...new Set(parsed.data)];
  if (!zoneIds.length) throw new AdminError("Cochez au moins une zone");
  const active = await db
    .select({ id: s.zones.id })
    .from(s.zones)
    .where(and(eq(s.zones.active, true), inArray(s.zones.id, zoneIds)));
  if (active.length !== zoneIds.length) throw new AdminError("Zone inconnue ou désactivée");
  const [account] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId));
  if (!account) throw new AdminError("Compte introuvable");
  await db.transaction(async (tx) => {
    const before = (await tx.select().from(s.userZones).where(eq(s.userZones.userId, userId))).map((r) => r.zoneId);
    await tx.delete(s.userZones).where(eq(s.userZones.userId, userId));
    await tx.insert(s.userZones).values(zoneIds.map((zoneId) => ({ userId, zoneId })));
    await writeAudit(tx, {
      userId: admin.id,
      action: "set_zones",
      entity: "user",
      entityId: userId,
      before: { zoneIds: before },
      after: { zoneIds },
    });
  });
}

/** Nouveau mot de passe provisoire ; tous les appareils connectés sont déconnectés. */
export async function resetPassword(db: Db, admin: AuthUser, userId: string): Promise<string> {
  requirePermission(admin, "user.manage");
  const password = generatePassword();
  const [updated] = await db
    .update(s.users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, updatedAt: new Date() })
    .where(eq(s.users.id, userId))
    .returning({ id: s.users.id });
  if (!updated) throw new AdminError("Compte introuvable");
  await revokeAllSessions(db, userId, admin.id, "Réinitialisation du mot de passe");
  await writeAudit(db, { userId: admin.id, action: "password_reset", entity: "user", entityId: userId });
  return password;
}

/** Active ou désactive un compte (jamais supprimé). Un compte désactivé est déconnecté partout. */
export async function setAccountActive(db: Db, admin: AuthUser, userId: string, active: boolean): Promise<void> {
  requirePermission(admin, "user.manage");
  if (userId === admin.id && !active) throw new AdminError("Vous ne pouvez pas désactiver votre propre compte");
  const [before] = await db.select({ active: s.users.active }).from(s.users).where(eq(s.users.id, userId));
  if (!before) throw new AdminError("Compte introuvable");
  await db.update(s.users).set({ active, updatedAt: new Date() }).where(eq(s.users.id, userId));
  if (!active) await revokeAllSessions(db, userId, admin.id, "Compte désactivé");
  await writeAudit(db, {
    userId: admin.id,
    action: active ? "activate" : "deactivate",
    entity: "user",
    entityId: userId,
    before,
    after: { active },
  });
}
