/**
 * Objectifs de pertes par zone (décision du 26/11/2026) : au plus N kg de pertes alimentaires par semaine de
 * production, datés. Suivi de l'écart à l'objectif et des progrès de chaque zone d'une semaine à l'autre.
 */
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import { datedChange } from "@/domain/versions-datees";
import { writeAudit } from "@/modules/audit/audit";
import { AdminError } from "@/modules/admin/accounts";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { loadFacts, type StatsFilters } from "@/modules/statistiques/facts";

/** Nombre de semaines montrées dans le suivi des progrès. */
export const TARGET_HISTORY_WEEKS = 8;

const targetSchema = z.object({
  maxKgPerWeek: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v),
    z
      .number({ message: "Indiquez un objectif en kg par semaine" })
      .refine((n) => Number.isFinite(n) && n >= 0 && n < 100_000, "Objectif invalide"),
  ),
  validFrom: z.iso.date({ message: "Date de début invalide" }),
  note: z.string().trim().max(200).optional(),
});

export async function listZoneTargets(db: Db, admin: AuthUser, today: LocalDate) {
  requirePermission(admin, "referentiel.manage");
  const [zones, targets] = await Promise.all([
    db.select().from(s.zones).orderBy(asc(s.zones.displayOrder)),
    db.select().from(s.zoneTargets).orderBy(desc(s.zoneTargets.validFrom)),
  ]);
  return zones.map((zone) => {
    const versions = targets.filter((t) => t.zoneId === zone.id);
    return {
      id: zone.id,
      name: zone.name,
      active: zone.active,
      versions,
      current: versions.find((v) => v.validFrom <= today && (v.validTo == null || v.validTo >= today)) ?? null,
    };
  });
}

export async function setZoneTarget(
  db: Db,
  admin: AuthUser,
  zoneId: string,
  raw: z.input<typeof targetSchema>,
  today: LocalDate,
) {
  requirePermission(admin, "referentiel.manage");
  const parsed = targetSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [zone] = await tx.select().from(s.zones).where(eq(s.zones.id, zoneId));
    if (!zone) throw new AdminError("Zone introuvable");
    const [latest] = await tx
      .select()
      .from(s.zoneTargets)
      .where(eq(s.zoneTargets.zoneId, zoneId))
      .orderBy(desc(s.zoneTargets.validFrom))
      .limit(1);
    const change = datedChange(latest, input.validFrom, today);
    if (change.kind === "refus") throw new AdminError(change.message);
    const values = { maxKgPerWeek: input.maxKgPerWeek, source: input.note || null, createdBy: admin.id };
    if (latest && change.kind === "correction") {
      const [after] = await tx.update(s.zoneTargets).set(values).where(eq(s.zoneTargets.id, latest.id)).returning();
      await writeAudit(tx, {
        userId: admin.id,
        action: "target_corrected",
        entity: "zone_target",
        entityId: latest.id,
        before: latest,
        after,
        reason: input.note || null,
      });
      return after!;
    }
    if (latest)
      await tx
        .update(s.zoneTargets)
        .set({ validTo: addDays(input.validFrom, -1) })
        .where(eq(s.zoneTargets.id, latest.id));
    const [created] = await tx
      .insert(s.zoneTargets)
      .values({ zoneId, validFrom: input.validFrom, ...values })
      .returning();
    await writeAudit(tx, {
      userId: admin.id,
      action: "target_new_version",
      entity: "zone_target",
      entityId: created!.id,
      before: latest ?? null,
      after: created,
      reason: input.note || null,
    });
    return created!;
  });
}

export interface ZoneProgress {
  zoneId: string;
  name: string;
  /** Semaines, de la plus ancienne à la semaine choisie : kg perdus et objectif en vigueur au début de la semaine. */
  weeks: { id: string; label: string; kg: number; target: number | null }[];
}

/**
 * Pertes alimentaires de chaque zone sur les dernières semaines de production jusqu'à la semaine choisie, face à
 * l'objectif en vigueur au début de chaque semaine. Retours fournisseur exclus, comme dans les statistiques.
 */
export async function zoneTargetProgress(
  db: Db,
  user: AuthUser,
  week: { year: number; number: number },
  filters: StatsFilters = {},
): Promise<{ weeks: { id: string; label: string }[]; zones: ZoneProgress[] } | null> {
  const [chosen] = await db
    .select()
    .from(s.productionWeeks)
    .where(and(eq(s.productionWeeks.year, week.year), eq(s.productionWeeks.number, week.number)));
  if (!chosen) return null;
  const weeks = (
    await db
      .select()
      .from(s.productionWeeks)
      .where(lte(s.productionWeeks.startDate, chosen.startDate))
      .orderBy(desc(s.productionWeeks.startDate))
      .limit(TARGET_HISTORY_WEEKS)
  ).reverse();
  const facts = await loadFacts(
    db,
    user,
    { kind: "periode", from: weeks[0]!.startDate, to: chosen.endDate },
    { ...filters, teamId: undefined },
  );
  const [zones, targets] = await Promise.all([
    db.select().from(s.zones).where(eq(s.zones.active, true)).orderBy(asc(s.zones.displayOrder)),
    db.select().from(s.zoneTargets),
  ]);
  const label = (w: { number: number }) => `S${String(w.number).padStart(2, "0")}`;
  const visibleZones = new Set(facts.map((f) => f.zoneId));
  const targeted = new Set(targets.map((t) => t.zoneId));
  return {
    weeks: weeks.map((w) => ({ id: w.id, label: label(w) })),
    zones: zones
      .filter((zone) =>
        filters.zoneId ? zone.id === filters.zoneId : visibleZones.has(zone.id) || targeted.has(zone.id),
      )
      .map((zone) => ({
        zoneId: zone.id,
        name: zone.name,
        weeks: weeks.map((w) => {
          const kg = facts
            .filter((f) => f.zoneId === zone.id && f.productionWeekId === w.id && f.food)
            .reduce((a, f) => a + (f.netKg ?? 0), 0);
          const target = targets.find(
            (t) =>
              t.zoneId === zone.id && t.validFrom <= w.startDate && (t.validTo == null || t.validTo >= w.startDate),
          );
          return { id: w.id, label: label(w), kg: Math.round(kg * 10) / 10, target: target?.maxKgPerWeek ?? null };
        }),
      })),
  };
}
