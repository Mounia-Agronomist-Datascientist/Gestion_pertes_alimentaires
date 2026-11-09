/**
 * Consultation du journal d'audit (lecture seule, permission « audit.read »).
 * Les champs sensibles (empreintes de mot de passe, jetons) ne sont jamais renvoyés à l'écran.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";

export const AUDIT_PAGE_SIZE = 50;

/** Champs techniques qui ne disent rien d'utile à un lecteur. */
const IGNORED_FIELDS = new Set(["updatedAt", "createdAt", "revision"]);
const SENSITIVE_FIELD = /password|hash|token|secret/i;

export interface AuditFilters {
  entity?: string | null;
  userId?: string | null;
  /** Nombre de jours à remonter ; vide = tout l'historique. */
  days?: number | null;
  page?: number;
}

/** Retire récursivement les champs sensibles d'une valeur enregistrée. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_FIELD.test(key))
        .map(([key, v]) => [key, redact(v)]),
    );
  }
  return value;
}

/**
 * Champs modifiés entre deux instantanés (premier niveau ; pour une déclaration, ses champs principaux).
 * Renvoie null quand il n'y a pas d'instantané avant/après à comparer.
 */
export function changedFields(before: unknown, after: unknown): string[] | null {
  const pick = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? ("declaration" in v ? (v as { declaration: unknown }).declaration : v) as Record<string, unknown>
      : null;
  const a = pick(before);
  const b = pick(after);
  if (!a || !b) return null;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter(
    (k) => !IGNORED_FIELDS.has(k) && !SENSITIVE_FIELD.test(k) && JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null),
  );
}

export async function listAuditEntries(db: Db, user: AuthUser, filters: AuditFilters, now = new Date()) {
  requirePermission(user, "audit.read");
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const where = and(
    filters.entity ? eq(s.auditLog.entity, filters.entity) : undefined,
    filters.userId ? eq(s.auditLog.userId, filters.userId) : undefined,
    filters.days ? gte(s.auditLog.occurredAt, new Date(now.getTime() - filters.days * 86_400_000)) : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: s.auditLog.id,
        occurredAt: s.auditLog.occurredAt,
        action: s.auditLog.action,
        entity: s.auditLog.entity,
        entityId: s.auditLog.entityId,
        reason: s.auditLog.reason,
        before: s.auditLog.before,
        after: s.auditLog.after,
        userLogin: s.users.login,
        userName: s.users.displayName,
      })
      .from(s.auditLog)
      .leftJoin(s.users, eq(s.auditLog.userId, s.users.id))
      .where(where)
      .orderBy(desc(s.auditLog.occurredAt), desc(s.auditLog.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(s.auditLog).where(where),
  ]);
  return {
    page,
    total: total?.n ?? 0,
    pageCount: Math.max(1, Math.ceil((total?.n ?? 0) / AUDIT_PAGE_SIZE)),
    entries: rows.map(({ before, after, ...r }) => ({
      ...r,
      changes: changedFields(before, after),
      before: redact(before),
      after: redact(after),
    })),
  };
}

/** Comptes ayant au moins une ligne dans le journal (filtre « qui »). */
export async function listAuditActors(db: Db, user: AuthUser) {
  requirePermission(user, "audit.read");
  return db
    .selectDistinct({ id: s.users.id, login: s.users.login, displayName: s.users.displayName })
    .from(s.auditLog)
    .innerJoin(s.users, eq(s.auditLog.userId, s.users.id))
    .orderBy(s.users.login);
}
