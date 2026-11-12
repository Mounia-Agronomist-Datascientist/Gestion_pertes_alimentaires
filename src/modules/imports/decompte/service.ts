/**
 * Enregistrement des barquettes réellement produites (« Décompte barquettes »), docs/PHASE4.md étape 4.6.
 * Le fichier est lu dans le navigateur ; seuls les codes et les nombres sont envoyés, revérifiés ici. Chaque
 * lecture validée est un instantané figé de la semaine ; une nouvelle lecture crée la version suivante.
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { ImportError } from "../service";

export const decomptePayloadSchema = z.object({
  fileName: z.string().min(1).max(200),
  sheetName: z.string().regex(/^Semaine \d{1,2}$/),
  year: z.number().int().min(2000).max(2100),
  week: z.number().int().min(1).max(53),
  rows: z
    .array(z.object({ code: z.string().regex(/^[A-Z]{2,3}\d{2}$/), made: z.number().int().min(0).max(1_000_000) }))
    .min(1)
    .max(500),
  warnings: z.array(z.string().max(300)).max(200),
});
export type DecomptePayload = z.infer<typeof decomptePayloadSchema>;

export async function saveProductionCount(db: Db, admin: AuthUser, input: DecomptePayload, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const codes = new Set<string>();
  for (const r of input.rows) {
    if (codes.has(r.code)) throw new ImportError(`Le code ${r.code} apparaît deux fois`);
    codes.add(r.code);
  }
  const [week] = await db
    .select()
    .from(s.productionWeeks)
    .where(and(eq(s.productionWeeks.year, input.year), eq(s.productionWeeks.number, input.week)));
  if (!week) throw new ImportError(`La semaine S${input.week}-${input.year} n'est pas dans le calendrier`);

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(s.productionCounts)
      .where(eq(s.productionCounts.productionWeekId, week.id))
      .orderBy(desc(s.productionCounts.version))
      .limit(1);
    if (previous?.status === "validee") {
      await tx.update(s.productionCounts).set({ status: "remplacee", replacedAt: now }).where(eq(s.productionCounts.id, previous.id));
    }
    const [created] = await tx
      .insert(s.productionCounts)
      .values({
        productionWeekId: week.id,
        version: (previous?.version ?? 0) + 1,
        fileName: input.fileName,
        sheetName: input.sheetName,
        anomalies: input.warnings,
        createdBy: admin.id,
        createdAt: now,
      })
      .returning();
    await tx.insert(s.productionCountLines).values(input.rows.map((r) => ({ countId: created!.id, code: r.code, madeBarquettes: r.made })));
    const total = input.rows.reduce((a, r) => a + r.made, 0);
    await writeAudit(tx, {
      userId: admin.id,
      action: "import_count",
      entity: "production_count",
      entityId: created!.id,
      after: { week: `S${input.week}-${input.year}`, version: created!.version, codes: input.rows.length, barquettes: total, file: `${input.fileName} (onglet ${input.sheetName})` },
      reason: previous ? `Remplace la version ${previous.version}` : null,
      occurredAt: now,
    });
    return { ...created!, total };
  });
}

/** Décomptes enregistrés, du plus récent au plus ancien (écran d'import). */
export async function listProductionCounts(db: Db, admin: AuthUser, limit = 20) {
  requirePermission(admin, "referentiel.manage");
  return db
    .select({
      id: s.productionCounts.id,
      version: s.productionCounts.version,
      status: s.productionCounts.status,
      createdAt: s.productionCounts.createdAt,
      fileName: s.productionCounts.fileName,
      sheetName: s.productionCounts.sheetName,
      anomalies: s.productionCounts.anomalies,
      weekYear: s.productionWeeks.year,
      weekNumber: s.productionWeeks.number,
      createdByName: s.users.displayName,
    })
    .from(s.productionCounts)
    .innerJoin(s.productionWeeks, eq(s.productionCounts.productionWeekId, s.productionWeeks.id))
    .innerJoin(s.users, eq(s.productionCounts.createdBy, s.users.id))
    .orderBy(desc(s.productionCounts.createdAt))
    .limit(limit);
}
