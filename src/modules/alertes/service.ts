/**
 * Alerte « rien de noté » (docs/REGLES_METIER.md R8).
 * L'évaluation est idempotente : elle peut être lancée à chaque affichage de l'accueil ou par une tâche planifiée.
 */
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { ESTIMATED_LOSS_KG_PER_WINDOW, isWindowClosed, reuseWindows } from "@/domain/plages-reutilisation";
import { addDays, type LocalDate, toProductionLocalDate } from "@/domain/semaine-production";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, can, requirePermission } from "@/modules/auth/permissions";

/** Période revue à chaque évaluation : couvre le délai de 7 jours laissé aux équipes, avec une marge. */
const LOOKBACK_DAYS = 21;

export interface EvaluationOptions {
  /** Date de mise en service : aucune plage commençant avant n'est contrôlée. Sans date, rien n'est évalué. */
  startDate: LocalDate | null;
  now?: Date;
}

export interface EvaluationResult {
  created: number;
  regularized: number;
}

/** Date de mise en service lue dans l'environnement (ALERTES_DEBUT=AAAA-MM-JJ). */
export function alertsStartDateFromEnv(): LocalDate | null {
  const value = process.env.ALERTES_DEBUT?.trim();
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function evaluateMissingDeclarations(db: Db, options: EvaluationOptions): Promise<EvaluationResult> {
  const result: EvaluationResult = { created: 0, regularized: 0 };
  if (!options.startDate) return result;
  const now = options.now ?? new Date();
  const today = toProductionLocalDate(now);
  const from = addDays(today, -LOOKBACK_DAYS);

  const weeks = await db
    .select()
    .from(s.productionWeeks)
    .where(and(lte(s.productionWeeks.startDate, today), gte(s.productionWeeks.endDate, from)));
  if (weeks.length === 0) return result;
  const weekIds = weeks.map((w) => w.id);

  const [days, teams, weekStatuses, teamAccounts, existing] = await Promise.all([
    db
      .select()
      .from(s.productionDays)
      .where(and(inArray(s.productionDays.productionWeekId, weekIds), eq(s.productionDays.isProductionDay, true))),
    db.select().from(s.teams).where(eq(s.teams.active, true)),
    db.select().from(s.teamWeekStatus).where(inArray(s.teamWeekStatus.productionWeekId, weekIds)),
    db.select({ id: s.users.id, teamId: s.users.teamId }).from(s.users).where(eq(s.users.roleCode, "equipe")),
    db.select().from(s.missingDeclarationAlerts).where(inArray(s.missingDeclarationAlerts.productionWeekId, weekIds)),
  ]);

  for (const week of weeks) {
    const windows = reuseWindows(
      week.startDate,
      days.filter((d) => d.productionWeekId === week.id).map((d) => d.day),
    ).filter((w) => isWindowClosed(w, today) && w.firstDay >= options.startDate!);

    for (const window of windows) {
      for (const team of teams) {
        const inactive = weekStatuses.some((st) => st.teamId === team.id && st.productionWeekId === week.id && !st.active);
        if (inactive) continue;

        // Comptent les pertes attribuées à l'équipe et celles saisies par son compte (même hors cuisine).
        const accountIds = teamAccounts.filter((u) => u.teamId === team.id).map((u) => u.id);
        const declared = await db.$count(
          s.lossDeclarations,
          and(
            inArray(s.lossDeclarations.status, ["validee", "corrigee"]),
            gte(s.lossDeclarations.occurredOn, window.firstDay),
            lte(s.lossDeclarations.occurredOn, window.lastDay),
            or(
              eq(s.lossDeclarations.teamId, team.id),
              accountIds.length ? inArray(s.lossDeclarations.createdBy, accountIds) : undefined,
            ),
          ),
        );
        const alert = existing.find((a) => a.teamId === team.id && a.productionWeekId === week.id && a.window === window.key);

        if (declared === 0 && !alert) {
          const [created] = await db
            .insert(s.missingDeclarationAlerts)
            .values({
              teamId: team.id,
              productionWeekId: week.id,
              window: window.key,
              firstDay: window.firstDay,
              lastDay: window.lastDay,
              estimatedKg: ESTIMATED_LOSS_KG_PER_WINDOW,
              detectedAt: now,
            })
            .onConflictDoNothing()
            .returning();
          if (created) {
            result.created++;
            await writeAudit(db, { action: "alert_created", entity: "missing_declaration_alert", entityId: created.id, after: created, occurredAt: now });
          }
        } else if (declared > 0 && alert?.status === "active") {
          await db
            .update(s.missingDeclarationAlerts)
            .set({ status: "regularisee", resolvedAt: now, resolutionNote: "Déclaration saisie après la détection" })
            .where(eq(s.missingDeclarationAlerts.id, alert.id));
          result.regularized++;
          await writeAudit(db, { action: "alert_regularized", entity: "missing_declaration_alert", entityId: alert.id, occurredAt: now });
        }
      }
    }
  }
  return result;
}

/** Alertes visibles par l'utilisateur : toutes (administration, production) ou celles de son équipe. */
export async function listAlerts(db: Db, user: AuthUser, options: { onlyActive?: boolean } = {}) {
  const scope = can(user, "alerts.read.all")
    ? undefined
    : user.teamId
      ? eq(s.missingDeclarationAlerts.teamId, user.teamId)
      : null;
  if (scope === null) return [];
  return db
    .select({
      id: s.missingDeclarationAlerts.id,
      window: s.missingDeclarationAlerts.window,
      firstDay: s.missingDeclarationAlerts.firstDay,
      lastDay: s.missingDeclarationAlerts.lastDay,
      estimatedKg: s.missingDeclarationAlerts.estimatedKg,
      status: s.missingDeclarationAlerts.status,
      detectedAt: s.missingDeclarationAlerts.detectedAt,
      resolutionNote: s.missingDeclarationAlerts.resolutionNote,
      teamId: s.teams.id,
      teamLetter: s.teams.letter,
      teamColorName: s.teams.colorName,
      teamColorHex: s.teams.colorHex,
      weekYear: s.productionWeeks.year,
      weekNumber: s.productionWeeks.number,
    })
    .from(s.missingDeclarationAlerts)
    .innerJoin(s.teams, eq(s.missingDeclarationAlerts.teamId, s.teams.id))
    .innerJoin(s.productionWeeks, eq(s.missingDeclarationAlerts.productionWeekId, s.productionWeeks.id))
    .where(and(scope, options.onlyActive ? eq(s.missingDeclarationAlerts.status, "active") : undefined))
    .orderBy(desc(s.missingDeclarationAlerts.lastDay), asc(s.teams.displayOrder));
}

export type AlertItem = Awaited<ReturnType<typeof listAlerts>>[number];

export class AlertError extends Error {}

/** Lève une alerte (ex. équipe absente non signalée) : l'estimation n'est plus comptée, motif obligatoire. */
export async function cancelAlert(db: Db, user: AuthUser, alertId: string, note: string, now = new Date()): Promise<void> {
  requirePermission(user, "alerts.resolve");
  const reason = note.trim();
  if (reason.length < 3) throw new AlertError("Indiquez le motif");
  const [alert] = await db.select().from(s.missingDeclarationAlerts).where(eq(s.missingDeclarationAlerts.id, alertId));
  if (!alert || alert.status !== "active") throw new AlertError("Cette alerte n'est plus active");
  await db
    .update(s.missingDeclarationAlerts)
    .set({ status: "annulee", resolvedAt: now, resolvedBy: user.id, resolutionNote: reason })
    .where(eq(s.missingDeclarationAlerts.id, alertId));
  await writeAudit(db, { userId: user.id, action: "alert_cancelled", entity: "missing_declaration_alert", entityId: alertId, reason, occurredAt: now });
}
