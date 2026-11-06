/**
 * Équipes temporairement inactives (cahier des charges §5.3) : une équipe n'est jamais supprimée,
 * elle peut être désactivée pour une semaine de production donnée.
 */
import { and, asc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";

export async function listTeamsForWeek(db: Db, admin: AuthUser, productionWeekId: string) {
  requirePermission(admin, "referentiel.manage");
  const [teams, statuses] = await Promise.all([
    db.select().from(s.teams).orderBy(asc(s.teams.displayOrder)),
    db.select().from(s.teamWeekStatus).where(eq(s.teamWeekStatus.productionWeekId, productionWeekId)),
  ]);
  return teams.map((t) => {
    const status = statuses.find((x) => x.teamId === t.id);
    return { ...t, activeThisWeek: t.active && status?.active !== false, note: status?.note ?? null };
  });
}

export async function setTeamWeekActive(
  db: Db,
  admin: AuthUser,
  input: { teamId: string; productionWeekId: string; active: boolean; note?: string | null },
): Promise<void> {
  requirePermission(admin, "referentiel.manage");
  const where = and(eq(s.teamWeekStatus.teamId, input.teamId), eq(s.teamWeekStatus.productionWeekId, input.productionWeekId));
  const [before] = await db.select().from(s.teamWeekStatus).where(where);
  const values = { active: input.active, note: input.note?.trim() || null, updatedAt: new Date() };
  if (before) {
    await db.update(s.teamWeekStatus).set(values).where(where);
  } else {
    await db.insert(s.teamWeekStatus).values({ teamId: input.teamId, productionWeekId: input.productionWeekId, ...values });
  }
  await writeAudit(db, {
    userId: admin.id,
    action: input.active ? "team_week_activate" : "team_week_deactivate",
    entity: "team",
    entityId: input.teamId,
    before: before ?? null,
    after: { productionWeekId: input.productionWeekId, ...values },
  });
}
