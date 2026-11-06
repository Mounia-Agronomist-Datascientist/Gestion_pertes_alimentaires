import { auditLog } from "@/db/schema";
import type { Db } from "@/db/types";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  occurredAt?: Date;
}

/** Inscrit une action dans le journal d'audit (insertion seule, docs/SECURITE.md §4). */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ip: entry.ip ?? null,
    ...(entry.occurredAt ? { occurredAt: entry.occurredAt } : {}),
  });
}
