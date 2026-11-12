/**
 * Enregistrement des pesées des Alchimistes (docs/PHASE5.md, étape 5.2). Le fichier est lu dans le navigateur ;
 * seules les collectes (date, poids, bac, qualité, incident, matière) sont envoyées et revérifiées ici. La
 * semaine de chaque collecte vient du calendrier stocké. Un nouveau dépôt remplace les collectes en vigueur sur
 * sa période ; elles restent en base, marquées par ce dépôt.
 */
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { ImportError } from "../service";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max).nullable();

export const alchimistesPayloadSchema = z
  .object({
    fileName: z.string().min(1).max(200),
    periodFrom: isoDate,
    periodTo: isoDate,
    deliveries: z.number().int().min(0).max(100_000),
    collections: z
      .array(
        z.object({
          date: isoDate,
          netKg: z.number().finite().min(0).max(10_000),
          containerType: text(120),
          containerNumber: text(20),
          quality: z.number().int().min(0).max(9).nullable(),
          incident: text(300),
          material: text(120),
          fileWeek: text(10),
        }),
      )
      .min(1)
      .max(20_000),
    warnings: z.array(z.string().max(400)).max(500),
  })
  .refine((p) => p.periodFrom <= p.periodTo && p.collections.every((c) => p.periodFrom <= c.date && c.date <= p.periodTo), {
    message: "Période incohérente",
  });
export type AlchimistesPayload = z.infer<typeof alchimistesPayloadSchema>;

export async function saveAlchimistesImport(db: Db, admin: AuthUser, input: AlchimistesPayload, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const weeks = await db
    .select({ id: s.productionWeeks.id, startDate: s.productionWeeks.startDate, endDate: s.productionWeeks.endDate })
    .from(s.productionWeeks)
    .where(and(lte(s.productionWeeks.startDate, input.periodTo), gte(s.productionWeeks.endDate, input.periodFrom)));
  const weekOf = (date: string) => weeks.find((w) => w.startDate <= date && date <= w.endDate)?.id;
  const outside = [...new Set(input.collections.map((c) => c.date).filter((d) => !weekOf(d)))];
  if (outside.length) throw new ImportError(`Dates hors du calendrier de production : ${outside.slice(0, 5).join(", ")}${outside.length > 5 ? "…" : ""}`);
  const totalKg = Math.round(input.collections.reduce((a, c) => a + c.netKg, 0) * 1000) / 1000;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(s.alchimistesImports)
      .values({
        fileName: input.fileName,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        collections: input.collections.length,
        totalKg,
        deliveries: input.deliveries,
        anomalies: input.warnings,
        createdBy: admin.id,
        createdAt: now,
      })
      .returning();
    const replaced = await tx
      .update(s.alchimistesCollections)
      .set({ replacedByImportId: created!.id })
      .where(
        and(
          isNull(s.alchimistesCollections.replacedByImportId),
          gte(s.alchimistesCollections.collectedOn, input.periodFrom),
          lte(s.alchimistesCollections.collectedOn, input.periodTo),
        ),
      )
      .returning({ id: s.alchimistesCollections.id });
    for (let i = 0; i < input.collections.length; i += 1000) {
      await tx.insert(s.alchimistesCollections).values(
        input.collections.slice(i, i + 1000).map((c) => ({
          importId: created!.id,
          collectedOn: c.date,
          productionWeekId: weekOf(c.date)!,
          containerType: c.containerType,
          containerNumber: c.containerNumber,
          netKg: c.netKg,
          quality: c.quality,
          incident: c.incident,
          material: c.material,
          fileWeek: c.fileWeek,
        })),
      );
    }
    await writeAudit(tx, {
      userId: admin.id,
      action: "import_alchimistes",
      entity: "alchimistes_import",
      entityId: created!.id,
      after: { period: `${input.periodFrom} → ${input.periodTo}`, collections: input.collections.length, totalKg, deliveries: input.deliveries, file: input.fileName },
      reason: replaced.length ? `Remplace ${replaced.length} collecte${replaced.length > 1 ? "s" : ""} de la période` : null,
      occurredAt: now,
    });
    return { ...created!, replaced: replaced.length };
  });
}

/** Dépôts enregistrés, du plus récent au plus ancien (écran d'import). */
export async function listAlchimistesImports(db: Db, admin: AuthUser, limit = 20) {
  requirePermission(admin, "referentiel.manage");
  return db
    .select({
      id: s.alchimistesImports.id,
      fileName: s.alchimistesImports.fileName,
      periodFrom: s.alchimistesImports.periodFrom,
      periodTo: s.alchimistesImports.periodTo,
      collections: s.alchimistesImports.collections,
      totalKg: s.alchimistesImports.totalKg,
      deliveries: s.alchimistesImports.deliveries,
      anomalies: s.alchimistesImports.anomalies,
      createdAt: s.alchimistesImports.createdAt,
      createdByName: s.users.displayName,
    })
    .from(s.alchimistesImports)
    .innerJoin(s.users, eq(s.alchimistesImports.createdBy, s.users.id))
    .orderBy(desc(s.alchimistesImports.createdAt))
    .limit(limit);
}

/** Période déjà couverte par des collectes en vigueur (pour prévenir d'un remplacement dans l'aperçu). */
export async function alchimistesCoverage(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  return db
    .select({ collectedOn: s.alchimistesCollections.collectedOn })
    .from(s.alchimistesCollections)
    .where(isNull(s.alchimistesCollections.replacedByImportId))
    .then((rows) => [...new Set(rows.map((r) => r.collectedOn))].sort());
}
