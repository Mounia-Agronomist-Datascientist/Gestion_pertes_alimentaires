/**
 * Calendrier des jours de production (docs/REGLES_METIER.md R8) : jeudi, vendredi, lundi, mardi, mercredi
 * par défaut ; l'administration ajuste au cas par cas (jour férié non travaillé, samedi travaillé).
 * Les alertes « rien de noté » ne contrôlent que les jours de production.
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { defaultProductionDays } from "@/domain/plages-reutilisation";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { AdminError } from "./accounts";

export interface WeekDay {
  day: LocalDate;
  isProductionDay: boolean;
  /** Jour de production dans le calendrier par défaut (jeudi, vendredi, lundi à mercredi). */
  isDefault: boolean;
  note: string | null;
}

/** Les 7 jours (jeudi → mercredi) d'une semaine stockée, avec leur statut. */
export async function listWeekDays(db: Db, admin: AuthUser, productionWeekId: string): Promise<WeekDay[]> {
  requirePermission(admin, "referentiel.manage");
  const [week] = await db.select().from(s.productionWeeks).where(eq(s.productionWeeks.id, productionWeekId));
  if (!week) throw new AdminError("Semaine absente du calendrier");
  const rows = await db
    .select()
    .from(s.productionDays)
    .where(and(gte(s.productionDays.day, week.startDate), lte(s.productionDays.day, week.endDate)))
    .orderBy(asc(s.productionDays.day));
  const defaults = new Set(defaultProductionDays(week.startDate));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(week.startDate, i);
    const row = rows.find((r) => r.day === day);
    return { day, isProductionDay: row?.isProductionDay ?? false, isDefault: defaults.has(day), note: row?.note ?? null };
  });
}

/** Déclare un jour travaillé ou non. Le jour doit appartenir à une semaine du calendrier ; tout est tracé. */
export async function setProductionDay(
  db: Db,
  admin: AuthUser,
  input: { day: LocalDate; isProductionDay: boolean; note?: string | null },
): Promise<void> {
  requirePermission(admin, "referentiel.manage");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new AdminError("Date invalide");
  const [week] = await db
    .select()
    .from(s.productionWeeks)
    .where(and(lte(s.productionWeeks.startDate, input.day), gte(s.productionWeeks.endDate, input.day)));
  if (!week) throw new AdminError("Ce jour n'appartient à aucune semaine du calendrier");

  const [before] = await db.select().from(s.productionDays).where(eq(s.productionDays.day, input.day));
  const values = { isProductionDay: input.isProductionDay, source: "admin", note: input.note?.trim() || null, updatedAt: new Date() };
  await db
    .insert(s.productionDays)
    .values({ day: input.day, productionWeekId: week.id, ...values })
    .onConflictDoUpdate({ target: s.productionDays.day, set: values });
  await writeAudit(db, {
    userId: admin.id,
    action: input.isProductionDay ? "production_day_on" : "production_day_off",
    entity: "production_day",
    entityId: input.day,
    before: before ?? null,
    after: { day: input.day, ...values },
    reason: values.note,
  });
}
