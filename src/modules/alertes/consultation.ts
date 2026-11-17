/**
 * Consultation des alertes d'analyse (docs/PHASE6.md, étape 6.4) : pertes inhabituelles et causes récurrentes.
 *
 * Qui voit quoi :
 * - toutes les alertes : profils qui voient toutes les alertes ou qui comparent les équipes (production,
 *   administration, direction) ;
 * - responsable de zone : les alertes de ses zones ;
 * - équipe : les alertes qui la concernent (son équipe, ses plats d'après le plan).
 * « Vu » se note par compte ; la première lecture fige l'alerte dans l'historique.
 */
import { and, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { AlertSettings } from "@/domain/pertes-inhabituelles";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, can, ForbiddenError, requirePermission } from "@/modules/auth/permissions";
import { loadAlertSettings } from "./reglages";

/** Condition de visibilité ; null : aucune alerte pour ce compte. */
function visibility(user: AuthUser): SQL | undefined | null {
  if (can(user, "alerts.read.all") || can(user, "stats.compare_teams")) return undefined;
  const parts: SQL[] = [];
  if (user.teamId) parts.push(eq(s.lossAlerts.teamId, user.teamId));
  if (can(user, "declaration.read.zone") && user.zoneIds.length) parts.push(and(eq(s.lossAlerts.scope, "zone"), inArray(s.lossAlerts.subjectKey, [...user.zoneIds]))!);
  return parts.length ? or(...parts)! : null;
}

export function canReadLossAlerts(user: AuthUser): boolean {
  return visibility(user) !== null;
}

export interface LossAlertView {
  id: string;
  kind: "perte_inhabituelle" | "cause_recurrente";
  scope: "equipe" | "zone" | "plat";
  label: string;
  week: { year: number; number: number };
  measure: string | null;
  value: number | null;
  reference: number | null;
  rate: number | null;
  referenceWeeks: number | null;
  details: Record<string, unknown>;
  detectedAt: Date;
  /** Vue par ce compte. */
  seen: boolean;
}

/** Alertes visibles, de la semaine la plus récente à la plus ancienne. */
export async function listLossAlerts(db: Db, user: AuthUser, options: { unseenOnly?: boolean; limit?: number } = {}): Promise<LossAlertView[]> {
  const scope = visibility(user);
  if (scope === null) return [];
  const a = s.lossAlerts;
  const rows = await db
    .select({
      id: a.id,
      kind: a.kind,
      scope: a.scope,
      label: a.label,
      year: s.productionWeeks.year,
      number: s.productionWeeks.number,
      measure: a.measure,
      value: a.value,
      reference: a.reference,
      rate: a.rate,
      referenceWeeks: a.referenceWeeks,
      details: a.details,
      detectedAt: a.detectedAt,
      seenAt: s.lossAlertViews.seenAt,
    })
    .from(a)
    .innerJoin(s.productionWeeks, eq(s.productionWeeks.id, a.productionWeekId))
    .leftJoin(s.lossAlertViews, and(eq(s.lossAlertViews.alertId, a.id), eq(s.lossAlertViews.userId, user.id)))
    .where(and(scope, options.unseenOnly ? isNull(s.lossAlertViews.seenAt) : undefined))
    .orderBy(desc(s.productionWeeks.startDate), a.kind, sql`${a.rate} desc nulls first`, a.label)
    .limit(options.limit ?? 200);
  return rows.map(({ year, number, seenAt, ...r }) => ({ ...r, week: { year, number }, seen: seenAt != null }));
}

/** Note l'alerte comme vue par ce compte (sans effet si elle l'est déjà). */
export async function markLossAlertSeen(db: Db, user: AuthUser, alertId: string, now = new Date()): Promise<void> {
  const scope = visibility(user);
  if (scope === null) throw new ForbiddenError();
  const [alert] = await db.select({ id: s.lossAlerts.id, seenAt: s.lossAlerts.seenAt }).from(s.lossAlerts).where(and(eq(s.lossAlerts.id, alertId), scope));
  if (!alert) throw new ForbiddenError("Alerte introuvable");
  await db.insert(s.lossAlertViews).values({ alertId, userId: user.id, seenAt: now }).onConflictDoNothing();
  if (!alert.seenAt) await db.update(s.lossAlerts).set({ seenAt: now, seenBy: user.id }).where(and(eq(s.lossAlerts.id, alertId), isNull(s.lossAlerts.seenAt)));
}

/** Note comme vues toutes les alertes visibles et non vues de ce compte. */
export async function markAllLossAlertsSeen(db: Db, user: AuthUser, now = new Date()): Promise<number> {
  const unseen = await listLossAlerts(db, user, { unseenOnly: true, limit: 1000 });
  for (const a of unseen) await markLossAlertSeen(db, user, a.id, now);
  return unseen.length;
}

export class AlertSettingsError extends Error {}

export const alertSettingsSchema = z.object({
  /** En pourcentage dans le formulaire (50 = +50 %). */
  unusualPercent: z.number().min(5, "Dépassement : 5 % au moins").max(1000, "Dépassement : 1 000 % au plus"),
  minKg: z.number().min(0, "Minimum : 0 kg au moins").max(10_000),
  recurrenceWeeks: z.number().int().min(2, "Au moins 2 semaines de suite").max(8, "8 semaines de suite au plus"),
  stablePercent: z.number().min(0).max(50, "Tendance stable : 50 % au plus"),
});

/** Modifie les seuils (administration), avec trace dans le journal d'audit. */
export async function updateAlertSettings(db: Db, admin: AuthUser, raw: z.input<typeof alertSettingsSchema>, now = new Date()): Promise<AlertSettings> {
  requirePermission(admin, "referentiel.manage");
  const parsed = alertSettingsSchema.safeParse(raw);
  if (!parsed.success) throw new AlertSettingsError(parsed.error.issues[0]?.message ?? "Valeurs invalides");
  const before = await loadAlertSettings(db);
  const after: AlertSettings = {
    unusualRate: Math.round(parsed.data.unusualPercent * 10) / 1000,
    minKg: parsed.data.minKg,
    recurrenceWeeks: parsed.data.recurrenceWeeks,
    trendStableRate: Math.round(parsed.data.stablePercent * 10) / 1000,
  };
  await db
    .insert(s.alertSettings)
    .values({ id: 1, ...after, updatedAt: now, updatedBy: admin.id })
    .onConflictDoUpdate({ target: s.alertSettings.id, set: { ...after, updatedAt: now, updatedBy: admin.id } });
  await writeAudit(db, { userId: admin.id, action: "update", entity: "alert_settings", entityId: null, before, after, occurredAt: now });
  return after;
}
