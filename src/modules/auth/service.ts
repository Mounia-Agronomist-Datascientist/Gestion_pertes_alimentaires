/**
 * Authentification : connexion, sessions, déconnexion, changement de mot de passe.
 * Indépendant de Next.js : la base est passée en paramètre, ce qui permet de tout tester.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { auditLog, rolePermissions, sessions, teams, userZones, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { assertPasswordPolicy, hashPassword, verifyAgainstDummy, verifyPassword } from "./password";
import type { AuthUser } from "./permissions";

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
/** Comptes utilisés sur les appareils de l'atelier : session longue pour ne pas se reconnecter à chaque perte. */
const LONG_SESSION_ROLES = new Set(["equipe", "resp_zone"]);

export function sessionDurationMs(roleCode: string): number {
  return LONG_SESSION_ROLES.has(roleCode) ? 30 * 24 * HOUR_MS : 12 * HOUR_MS;
}

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: AuthUser }
  | { ok: false; reason: "invalid" | "locked" };

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}

export async function login(
  db: Db,
  input: { login: string; password: string },
  meta: RequestMeta = {},
): Promise<LoginResult> {
  const now = meta.now ?? new Date();
  const loginName = normalizeLogin(input.login);
  const [user] = await db.select().from(users).where(eq(users.login, loginName));

  // Échecs depuis la dernière connexion réussie, dans la fenêtre de blocage.
  const windowStart = new Date(now.getTime() - LOGIN_LOCK_MS);
  const since = user?.lastLoginAt && user.lastLoginAt > windowStart ? user.lastLoginAt : windowStart;
  const [failures] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "login_failed"),
        eq(auditLog.entity, "user"),
        eq(auditLog.entityId, loginName),
        gt(auditLog.occurredAt, since),
      ),
    );
  if ((failures?.n ?? 0) >= LOGIN_MAX_FAILURES) {
    await writeAudit(db, { action: "login_blocked", entity: "user", entityId: loginName, ip: meta.ip, occurredAt: now });
    return { ok: false, reason: "locked" };
  }

  const valid =
    user && user.active ? await verifyPassword(user.passwordHash, input.password) : await verifyAgainstDummy(input.password);
  if (!user || !user.active || !valid) {
    await writeAudit(db, {
      userId: user?.id ?? null,
      action: "login_failed",
      entity: "user",
      entityId: loginName,
      ip: meta.ip,
      occurredAt: now,
    });
    return { ok: false, reason: "invalid" };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + sessionDurationMs(user.roleCode));
  await db.insert(sessions).values({ id: hashToken(token), userId: user.id, expiresAt, userAgent: meta.userAgent ?? null });
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  await writeAudit(db, { userId: user.id, action: "login", entity: "user", entityId: loginName, ip: meta.ip, occurredAt: now });

  return { ok: true, token, expiresAt, user: await loadAuthUser(db, user.id) };
}

/** Construit le profil de l'utilisateur connecté : rôle, équipe, zones et permissions. */
export async function loadAuthUser(db: Db, userId: string): Promise<AuthUser> {
  const [row] = await db
    .select({
      id: users.id,
      login: users.login,
      displayName: users.displayName,
      roleCode: users.roleCode,
      teamId: users.teamId,
      mustChangePassword: users.mustChangePassword,
      teamLetter: teams.letter,
      teamColorName: teams.colorName,
      teamColorHex: teams.colorHex,
    })
    .from(users)
    .leftJoin(teams, eq(users.teamId, teams.id))
    .where(eq(users.id, userId));
  if (!row) throw new Error(`Utilisateur introuvable : ${userId}`);

  const [perms, zones] = await Promise.all([
    db.select({ code: rolePermissions.permissionCode }).from(rolePermissions).where(eq(rolePermissions.roleCode, row.roleCode)),
    db.select({ zoneId: userZones.zoneId }).from(userZones).where(eq(userZones.userId, userId)),
  ]);

  return {
    id: row.id,
    login: row.login,
    displayName: row.displayName,
    roleCode: row.roleCode,
    teamId: row.teamId,
    team:
      row.teamLetter && row.teamColorName && row.teamColorHex
        ? { letter: row.teamLetter, colorName: row.teamColorName, colorHex: row.teamColorHex }
        : null,
    zoneIds: zones.map((z) => z.zoneId),
    permissions: new Set(perms.map((p) => p.code)),
    mustChangePassword: row.mustChangePassword,
  };
}

export interface ValidSession {
  user: AuthUser;
  expiresAt: Date;
  /** Vrai si l'expiration a été repoussée : le cookie doit être mis à jour. */
  renewed: boolean;
}

/**
 * Vérifie un jeton de session. Expiration glissante : la session est prolongée
 * lorsqu'elle a consommé plus de la moitié de sa durée.
 */
export async function validateSession(db: Db, token: string, now = new Date()): Promise<ValidSession | null> {
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await db
    .select({ expiresAt: sessions.expiresAt, userId: users.id, active: users.active, roleCode: users.roleCode })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));
  if (!row) return null;
  if (!row.active || row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  const duration = sessionDurationMs(row.roleCode);
  let expiresAt = row.expiresAt;
  let renewed = false;
  if (expiresAt.getTime() - now.getTime() < duration / 2) {
    expiresAt = new Date(now.getTime() + duration);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    renewed = true;
  }
  return { user: await loadAuthUser(db, row.userId), expiresAt, renewed };
}

export async function logout(db: Db, token: string): Promise<void> {
  const id = hashToken(token);
  const [session] = await db.delete(sessions).where(eq(sessions.id, id)).returning({ userId: sessions.userId });
  if (session) {
    await writeAudit(db, { userId: session.userId, action: "logout", entity: "user", entityId: session.userId });
  }
}

/** Déconnecte tous les appareils d'un compte (ex. après un départ ou un changement de mot de passe). */
export async function revokeAllSessions(db: Db, userId: string, actorId: string | null, reason?: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await writeAudit(db, { userId: actorId, action: "sessions_revoked", entity: "user", entityId: userId, reason });
}

export class InvalidCurrentPasswordError extends Error {}

/**
 * Changement de mot de passe par l'utilisateur. Les autres sessions du compte sont fermées,
 * la session en cours (`keepToken`) est conservée.
 */
export async function changePassword(
  db: Db,
  userId: string,
  input: { current: string; next: string },
  keepToken?: string,
): Promise<void> {
  assertPasswordPolicy(input.next);
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(user.passwordHash, input.current))) {
    throw new InvalidCurrentPasswordError("Mot de passe actuel incorrect");
  }
  if (input.current === input.next) {
    throw new InvalidCurrentPasswordError("Le nouveau mot de passe doit être différent de l'actuel");
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.next), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, userId));
  const keepId = keepToken ? hashToken(keepToken) : null;
  const userSessions = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of userSessions) {
    if (s.id !== keepId) await db.delete(sessions).where(eq(sessions.id, s.id));
  }
  await writeAudit(db, { userId, action: "password_change", entity: "user", entityId: userId });
}
