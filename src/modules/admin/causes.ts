/**
 * Causes de pertes (cahier des charges §9) : gestion par l'administrateur et propositions des utilisateurs.
 * Une cause n'est jamais supprimée ; les déclarations conservent le nom de la cause au moment de la saisie.
 */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { AdminError } from "./accounts";

/** Nom comparable : sans accents, casse ni espaces superflus (évite les doublons de formulation). */
export function normalizeCauseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const causeSchema = z.object({
  name: z.string().trim().min(3, "Le nom de la cause est trop court").max(120),
  description: z.string().trim().max(300).nullable().optional(),
  zoneIds: z.array(z.uuid()).min(1, "Choisissez au moins une zone"),
});

async function assertUniqueName(db: Db, name: string, exceptId?: string) {
  const others = await db
    .select({ id: s.causes.id, name: s.causes.name, status: s.causes.status })
    .from(s.causes)
    .where(and(ne(s.causes.status, "rejetee"), exceptId ? ne(s.causes.id, exceptId) : undefined));
  const target = normalizeCauseName(name);
  const twin = others.find((c) => normalizeCauseName(c.name) === target);
  if (twin) {
    throw new AdminError(
      twin.status === "proposee" ? `« ${twin.name} » a déjà été proposée` : `La cause « ${twin.name} » existe déjà`,
    );
  }
}

async function setZones(db: Db, causeId: string, zoneIds: readonly string[]) {
  await db.delete(s.causeZones).where(eq(s.causeZones.causeId, causeId));
  if (zoneIds.length) await db.insert(s.causeZones).values(zoneIds.map((zoneId) => ({ causeId, zoneId })));
}

/**
 * Un utilisateur propose une cause manquante (§9.3) : elle n'apparaît dans les listes
 * qu'après validation par l'administrateur.
 */
export async function proposeCause(db: Db, user: AuthUser, raw: { name: unknown; description?: unknown; zoneId: unknown }) {
  requirePermission(user, "cause.propose");
  const parsed = causeSchema.safeParse({ name: raw.name, description: raw.description ?? null, zoneIds: [raw.zoneId] });
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Proposition invalide");
  await assertUniqueName(db, parsed.data.name);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [cause] = await tx
      .insert(s.causes)
      .values({
        name: parsed.data.name,
        description: parsed.data.description || null,
        status: "proposee",
        proposedBy: user.id,
        proposedAt: now,
      })
      .returning();
    await setZones(tx, cause!.id, parsed.data.zoneIds);
    await writeAudit(tx, { userId: user.id, action: "propose", entity: "cause", entityId: cause!.id, after: { ...cause, zoneIds: parsed.data.zoneIds } });
    return cause!;
  });
}

export async function listCausesForAdmin(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const [causes, links, subzoneLinks] = await Promise.all([
    db
      .select({ cause: s.causes, proposedByName: s.users.displayName })
      .from(s.causes)
      .leftJoin(s.users, eq(s.causes.proposedBy, s.users.id))
      .orderBy(asc(s.causes.displayOrder), asc(s.causes.name)),
    db.select().from(s.causeZones),
    db
      .select({ causeId: s.causeSubzones.causeId, name: s.subzones.name })
      .from(s.causeSubzones)
      .innerJoin(s.subzones, eq(s.causeSubzones.subzoneId, s.subzones.id)),
  ]);
  return causes.map(({ cause, proposedByName }) => ({
    ...cause,
    proposedByName,
    zoneIds: links.filter((l) => l.causeId === cause.id).map((l) => l.zoneId),
    subzoneNames: subzoneLinks.filter((l) => l.causeId === cause.id).map((l) => l.name),
  }));
}

export async function createCause(db: Db, admin: AuthUser, raw: unknown) {
  requirePermission(admin, "referentiel.manage");
  const parsed = causeSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  await assertUniqueName(db, parsed.data.name);
  return db.transaction(async (tx) => {
    const [cause] = await tx
      .insert(s.causes)
      .values({ name: parsed.data.name, description: parsed.data.description || null, status: "active", displayOrder: 500 })
      .returning();
    await setZones(tx, cause!.id, parsed.data.zoneIds);
    await writeAudit(tx, { userId: admin.id, action: "create", entity: "cause", entityId: cause!.id, after: { ...cause, zoneIds: parsed.data.zoneIds } });
    return cause!;
  });
}

/** Modifie le nom, la description et les zones d'une cause (les déclarations passées gardent l'ancien nom). */
export async function updateCause(db: Db, admin: AuthUser, causeId: string, raw: unknown) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.causes).where(eq(s.causes.id, causeId));
  if (!before) throw new AdminError("Cause introuvable");
  const parsed = before.isOther
    ? causeSchema.omit({ zoneIds: true }).extend({ zoneIds: z.array(z.uuid()).default([]) }).safeParse(raw)
    : causeSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  await assertUniqueName(db, parsed.data.name, causeId);
  const beforeZones = (await db.select().from(s.causeZones).where(eq(s.causeZones.causeId, causeId))).map((l) => l.zoneId);
  await db.transaction(async (tx) => {
    await tx
      .update(s.causes)
      .set({ name: parsed.data.name, description: parsed.data.description || null, updatedAt: new Date() })
      .where(eq(s.causes.id, causeId));
    if (!before.isOther) await setZones(tx, causeId, parsed.data.zoneIds);
    await writeAudit(tx, {
      userId: admin.id,
      action: "update",
      entity: "cause",
      entityId: causeId,
      before: { ...before, zoneIds: beforeZones },
      after: { name: parsed.data.name, description: parsed.data.description, zoneIds: parsed.data.zoneIds },
    });
  });
}

/** Valide (avec éventuelle reformulation et choix des zones) ou rejette une cause proposée. */
export async function reviewCause(
  db: Db,
  admin: AuthUser,
  causeId: string,
  decision: { accept: true; name: string; description?: string | null; zoneIds: string[] } | { accept: false; reason?: string },
) {
  requirePermission(admin, "cause.review");
  const [before] = await db.select().from(s.causes).where(eq(s.causes.id, causeId));
  if (!before || before.status !== "proposee") throw new AdminError("Cette proposition n'est plus en attente");
  const now = new Date();
  if (decision.accept) {
    await updateCause(db, admin, causeId, { name: decision.name, description: decision.description, zoneIds: decision.zoneIds });
    await db
      .update(s.causes)
      .set({ status: "active", reviewedBy: admin.id, reviewedAt: now, displayOrder: 500 })
      .where(eq(s.causes.id, causeId));
  } else {
    await db.update(s.causes).set({ status: "rejetee", reviewedBy: admin.id, reviewedAt: now }).where(eq(s.causes.id, causeId));
  }
  await writeAudit(db, {
    userId: admin.id,
    action: decision.accept ? "accept" : "reject",
    entity: "cause",
    entityId: causeId,
    reason: decision.accept ? null : (decision.reason ?? null),
  });
}

/** Active ou désactive une cause ; « Autres pertes » reste toujours disponible (§9.2). */
export async function setCauseActive(db: Db, admin: AuthUser, causeId: string, active: boolean) {
  requirePermission(admin, "referentiel.manage");
  const [cause] = await db.select().from(s.causes).where(eq(s.causes.id, causeId));
  if (!cause) throw new AdminError("Cause introuvable");
  if (cause.isOther && !active) throw new AdminError("« Autres pertes » doit toujours rester disponible");
  if (!["active", "inactive"].includes(cause.status)) throw new AdminError("Traitez d'abord la proposition");
  await db.update(s.causes).set({ status: active ? "active" : "inactive", updatedAt: new Date() }).where(eq(s.causes.id, causeId));
  await writeAudit(db, { userId: admin.id, action: active ? "activate" : "deactivate", entity: "cause", entityId: causeId });
}

/** Nombre de propositions en attente (pour signaler l'administration). */
export async function countPendingProposals(db: Db): Promise<number> {
  return db.$count(s.causes, inArray(s.causes.status, ["proposee"]));
}
