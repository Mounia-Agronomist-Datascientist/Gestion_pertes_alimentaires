/**
 * Gastros, échelles et tares datées (docs/REGLES_METIER.md R3).
 * Une nouvelle tare s'applique à partir d'une date : la version précédente est clôturée la veille.
 * Les déclarations gardent la tare utilisée à l'époque (instantané), une nouvelle tare ne les change pas.
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { AdminError } from "./accounts";

const decimal = (message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v),
    z.number({ message }).positive(message),
  );

const tareSchema = z.object({
  containerTypeId: z.uuid(),
  unitTareKg: decimal("Indiquez une tare positive en kg").refine((v) => v < 100, "Tare trop élevée : vérifiez la saisie"),
  validFrom: z.iso.date({ message: "Date de début invalide" }),
  note: z.string().trim().max(200).optional(),
});

/** Types de contenants avec leurs versions de tare, de la plus récente à la plus ancienne. */
export async function listContainersForAdmin(db: Db, admin: AuthUser, today: LocalDate) {
  requirePermission(admin, "referentiel.manage");
  const [types, tares, used] = await Promise.all([
    db.select().from(s.containerTypes).orderBy(asc(s.containerTypes.displayOrder)),
    db.select().from(s.containerTares).orderBy(desc(s.containerTares.validFrom)),
    db.selectDistinct({ id: s.declarationContainers.containerTareId }).from(s.declarationContainers),
  ]);
  const usedIds = new Set(used.map((u) => u.id));
  return types.map((t) => {
    const versions = tares
      .filter((v) => v.containerTypeId === t.id)
      .map((v) => ({ ...v, used: usedIds.has(v.id) }));
    const current = versions.find((v) => v.validFrom <= today && (v.validTo == null || v.validTo >= today)) ?? null;
    return { ...t, versions, current };
  });
}

/**
 * Enregistre une tare à partir d'une date.
 * - date postérieure à la dernière version : nouvelle version, la précédente est clôturée la veille ;
 * - même date que la dernière version, jamais utilisée : correction d'une erreur de saisie ;
 * - sinon refus, pour ne jamais réécrire une tare qui a servi.
 */
export async function setContainerTare(db: Db, admin: AuthUser, raw: z.input<typeof tareSchema>) {
  requirePermission(admin, "referentiel.manage");
  const parsed = tareSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const input = parsed.data;
  const source = input.note || "Administration";

  return db.transaction(async (tx) => {
    const [type] = await tx.select().from(s.containerTypes).where(eq(s.containerTypes.id, input.containerTypeId));
    if (!type) throw new AdminError("Contenant introuvable");
    const [latest] = await tx
      .select()
      .from(s.containerTares)
      .where(eq(s.containerTares.containerTypeId, type.id))
      .orderBy(desc(s.containerTares.validFrom))
      .limit(1);

    if (latest && input.validFrom < latest.validFrom) {
      throw new AdminError(`Une tare plus récente existe déjà (à partir du ${latest.validFrom.split("-").reverse().join("/")}) : choisissez une date ultérieure`);
    }
    if (latest && input.validFrom === latest.validFrom) {
      const [use] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.declarationContainers)
        .where(eq(s.declarationContainers.containerTareId, latest.id));
      if ((use?.n ?? 0) > 0) {
        throw new AdminError("Cette tare a déjà servi dans des déclarations : choisissez une date de début ultérieure");
      }
      const [after] = await tx
        .update(s.containerTares)
        .set({ unitTareKg: input.unitTareKg, source, createdBy: admin.id })
        .where(eq(s.containerTares.id, latest.id))
        .returning();
      await writeAudit(tx, { userId: admin.id, action: "tare_corrected", entity: "container_tare", entityId: latest.id, before: latest, after, reason: input.note || null });
      return after!;
    }

    if (latest) {
      await tx.update(s.containerTares).set({ validTo: addDays(input.validFrom, -1) }).where(eq(s.containerTares.id, latest.id));
    }
    const [created] = await tx
      .insert(s.containerTares)
      .values({ containerTypeId: type.id, unitTareKg: input.unitTareKg, validFrom: input.validFrom, source, createdBy: admin.id })
      .returning();
    await writeAudit(tx, { userId: admin.id, action: "tare_new_version", entity: "container_tare", entityId: created!.id, before: latest ?? null, after: created, reason: input.note || null });
    return created!;
  });
}

/** Nombre maximum de gastros d'un type sur une échelle (contrôle de saisie). */
export async function setContainerMaxCount(db: Db, admin: AuthUser, containerTypeId: string, rawMax: unknown) {
  requirePermission(admin, "referentiel.manage");
  const max = Number(String(rawMax ?? "").trim());
  if (!Number.isInteger(max) || max < 1 || max > 200) throw new AdminError("Nombre maximum invalide (entier entre 1 et 200)");
  const [before] = await db.select().from(s.containerTypes).where(eq(s.containerTypes.id, containerTypeId));
  if (!before) throw new AdminError("Contenant introuvable");
  if (before.kind !== "gastro") throw new AdminError("Le nombre maximum ne concerne que les gastros");
  await db.update(s.containerTypes).set({ maxCount: max, updatedAt: new Date() }).where(eq(s.containerTypes.id, containerTypeId));
  await writeAudit(db, { userId: admin.id, action: "update", entity: "container_type", entityId: containerTypeId, before, after: { ...before, maxCount: max } });
}

/** Un contenant désactivé n'est plus proposé à la saisie ; ses tares et l'historique restent. */
export async function setContainerActive(db: Db, admin: AuthUser, containerTypeId: string, active: boolean) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.containerTypes).where(eq(s.containerTypes.id, containerTypeId));
  if (!before) throw new AdminError("Contenant introuvable");
  await db.update(s.containerTypes).set({ active, updatedAt: new Date() }).where(eq(s.containerTypes.id, containerTypeId));
  await writeAudit(db, { userId: admin.id, action: active ? "activate" : "deactivate", entity: "container_type", entityId: containerTypeId, before });
}
