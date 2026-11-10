/**
 * Coût horaire moyen de main-d'œuvre par zone (docs/PHASE3.md, étape 3.6 ; cahier des charges §18.2).
 * Saisi et daté, mais **jamais imputé aux pertes** tant que la méthode d'affectation n'est pas définie : on ne
 * connaît pas le temps de travail réellement perdu, et la production n'a pas de coût par poste.
 */
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import { datedChange } from "@/domain/versions-datees";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { AdminError } from "./accounts";

const rateSchema = z.object({
  hourlyCostEur: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v),
    z.number({ message: "Indiquez un coût horaire" }).refine((n) => Number.isFinite(n) && n >= 0 && n < 1000, "Coût horaire invalide"),
  ),
  unit: z.string().trim().min(1).max(40).default("heure"),
  validFrom: z.iso.date({ message: "Date de début invalide" }),
  note: z.string().trim().max(200).optional(),
});

export async function listLabourRates(db: Db, admin: AuthUser, today: LocalDate) {
  requirePermission(admin, "referentiel.manage");
  const [zones, rates] = await Promise.all([
    db.select().from(s.zones).orderBy(asc(s.zones.displayOrder)),
    db.select().from(s.labourRates).orderBy(desc(s.labourRates.validFrom)),
  ]);
  return zones.map((z) => {
    const versions = rates.filter((r) => r.zoneId === z.id);
    return { id: z.id, name: z.name, active: z.active, versions, current: versions.find((v) => v.validFrom <= today && (v.validTo == null || v.validTo >= today)) ?? null };
  });
}

export async function setLabourRate(db: Db, admin: AuthUser, zoneId: string, raw: z.input<typeof rateSchema>, today: LocalDate) {
  requirePermission(admin, "referentiel.manage");
  const parsed = rateSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [zone] = await tx.select().from(s.zones).where(eq(s.zones.id, zoneId));
    if (!zone) throw new AdminError("Zone introuvable");
    const [latest] = await tx.select().from(s.labourRates).where(eq(s.labourRates.zoneId, zoneId)).orderBy(desc(s.labourRates.validFrom)).limit(1);
    const change = datedChange(latest, input.validFrom, today);
    if (change.kind === "refus") throw new AdminError(change.message);
    const values = { hourlyCostEur: input.hourlyCostEur, unit: input.unit, source: input.note || null, createdBy: admin.id };
    if (latest && change.kind === "correction") {
      const [after] = await tx.update(s.labourRates).set(values).where(eq(s.labourRates.id, latest.id)).returning();
      await writeAudit(tx, { userId: admin.id, action: "cost_corrected", entity: "labour_rate", entityId: latest.id, before: latest, after, reason: input.note || null });
      return after!;
    }
    if (latest) await tx.update(s.labourRates).set({ validTo: addDays(input.validFrom, -1) }).where(eq(s.labourRates.id, latest.id));
    const [created] = await tx.insert(s.labourRates).values({ zoneId, validFrom: input.validFrom, ...values }).returning();
    await writeAudit(tx, { userId: admin.id, action: "cost_new_version", entity: "labour_rate", entityId: created!.id, before: latest ?? null, after: created, reason: input.note || null });
    return created!;
  });
}
