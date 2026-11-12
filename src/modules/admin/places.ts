/**
 * Destinations, zones et sous-zones (cahier des charges §5, docs/ECRANS_PHASE1.md E6).
 * Rien n'est supprimé : on désactive. Les déclarations font référence à ces lignes ; un renommage se voit donc
 * dans l'historique : il est réservé aux reformulations, un vrai changement se fait en créant une nouvelle ligne.
 * Le mode d'attribution d'une sous-zone (équipe ou zone, R7) est une règle métier validée : il n'est pas
 * modifiable ici, une nouvelle sous-zone reprend celui de sa zone.
 */
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { AdminError } from "./accounts";
import { DESTINATION_KINDS } from "./destination-kinds";
import { normalizeCauseName as normalizeLabel } from "./causes";

const name = z.string().trim().min(2, "Le nom est trop court").max(120);

/** Code technique stable tiré du nom (« Vente au personnel » → ADM_VENTE_AU_PERSONNEL), unique dans la table. */
function codeFrom(label: string, taken: readonly string[]): string {
  const base = `ADM_${normalizeLabel(label).replace(/ /g, "_").toUpperCase()}`.slice(0, 40);
  let code = base;
  for (let i = 2; taken.includes(code); i++) code = `${base}_${i}`;
  return code;
}

/** Échange la position d'une ligne avec sa voisine ; les positions sont renumérotées 0, 1, 2… */
async function move<T extends { id: string }>(
  rows: T[],
  id: string,
  direction: "up" | "down",
  save: (id: string, displayOrder: number) => Promise<unknown>,
) {
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) throw new AdminError("Ligne introuvable");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return;
  const ordered = [...rows];
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
  for (const [i, row] of ordered.entries()) await save(row.id, i);
}

// ─── Destinations ────────────────────────────────────────────────────────────

const destinationSchema = z
  .object({
    name,
    kind: z.enum(DESTINATION_KINDS, { message: "Choisissez le type de destination" }),
    financialRecovery: z.boolean().default(false),
    binNumberRequired: z.boolean().default(false),
  })
  .refine((d) => !d.financialRecovery || d.kind === "vente", { message: "Seule une vente peut rapporter une recette" });

export async function listDestinationsForAdmin(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const [rows, used] = await Promise.all([
    db.select().from(s.destinations).orderBy(asc(s.destinations.displayOrder), asc(s.destinations.name)),
    db.selectDistinct({ id: s.declarationDestinations.destinationId }).from(s.declarationDestinations),
  ]);
  const usedIds = new Set(used.map((u) => u.id));
  return rows.map((d) => ({ ...d, used: usedIds.has(d.id) }));
}

async function assertUniqueDestinationName(db: Db, label: string, excludeId?: string) {
  const others = await db.select().from(s.destinations).where(excludeId ? ne(s.destinations.id, excludeId) : undefined);
  if (others.some((d) => normalizeLabel(d.name) === normalizeLabel(label))) throw new AdminError("Cette destination existe déjà");
  return others;
}

export async function createDestination(db: Db, admin: AuthUser, raw: z.input<typeof destinationSchema>) {
  requirePermission(admin, "referentiel.manage");
  const parsed = destinationSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const others = await assertUniqueDestinationName(db, parsed.data.name);
  const [created] = await db
    .insert(s.destinations)
    .values({
      ...parsed.data,
      code: codeFrom(parsed.data.name, others.map((d) => d.code)),
      displayOrder: Math.max(-1, ...others.map((d) => d.displayOrder)) + 1,
    })
    .returning();
  await writeAudit(db, { userId: admin.id, action: "create", entity: "destination", entityId: created!.id, after: created });
  return created!;
}

/** Le type et la recette ne changent plus une fois la destination utilisée : les statistiques passées en dépendent. */
export async function updateDestination(db: Db, admin: AuthUser, id: string, raw: z.input<typeof destinationSchema>) {
  requirePermission(admin, "referentiel.manage");
  const parsed = destinationSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const [before] = await db.select().from(s.destinations).where(eq(s.destinations.id, id));
  if (!before) throw new AdminError("Destination introuvable");
  await assertUniqueDestinationName(db, parsed.data.name, id);
  const [use] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.declarationDestinations)
    .where(eq(s.declarationDestinations.destinationId, id));
  if ((use?.n ?? 0) > 0 && (parsed.data.kind !== before.kind || parsed.data.financialRecovery !== before.financialRecovery)) {
    throw new AdminError("Destination déjà utilisée : son type ne peut plus changer. Créez une nouvelle destination et désactivez celle-ci.");
  }
  const [after] = await db
    .update(s.destinations)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(s.destinations.id, id))
    .returning();
  await writeAudit(db, { userId: admin.id, action: "update", entity: "destination", entityId: id, before, after });
}

export async function setDestinationActive(db: Db, admin: AuthUser, id: string, active: boolean) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.destinations).where(eq(s.destinations.id, id));
  if (!before) throw new AdminError("Destination introuvable");
  if (!active) {
    const [others] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.destinations)
      .where(and(eq(s.destinations.active, true), ne(s.destinations.id, id)));
    if ((others?.n ?? 0) === 0) throw new AdminError("Il faut au moins une destination active");
  }
  await db.update(s.destinations).set({ active, updatedAt: new Date() }).where(eq(s.destinations.id, id));
  await writeAudit(db, { userId: admin.id, action: active ? "activate" : "deactivate", entity: "destination", entityId: id, before });
}

export async function moveDestination(db: Db, admin: AuthUser, id: string, direction: "up" | "down") {
  requirePermission(admin, "referentiel.manage");
  const rows = await db.select().from(s.destinations).orderBy(asc(s.destinations.displayOrder), asc(s.destinations.name));
  await move(rows, id, direction, (rowId, displayOrder) =>
    db.update(s.destinations).set({ displayOrder }).where(eq(s.destinations.id, rowId)),
  );
}

// ─── Zones et sous-zones ─────────────────────────────────────────────────────

export async function listZonesForAdmin(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const [zones, subzones] = await Promise.all([
    db.select().from(s.zones).orderBy(asc(s.zones.displayOrder)),
    db.select().from(s.subzones).orderBy(asc(s.subzones.displayOrder), asc(s.subzones.name)),
  ]);
  return zones.map((z) => ({ ...z, subzones: subzones.filter((sz) => sz.zoneId === z.id) }));
}

export async function renameZone(db: Db, admin: AuthUser, id: string, rawName: unknown) {
  requirePermission(admin, "referentiel.manage");
  const parsed = name.safeParse(rawName);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const [before] = await db.select().from(s.zones).where(eq(s.zones.id, id));
  if (!before) throw new AdminError("Zone introuvable");
  const others = await db.select().from(s.zones).where(ne(s.zones.id, id));
  if (others.some((z) => normalizeLabel(z.name) === normalizeLabel(parsed.data))) throw new AdminError("Cette zone existe déjà");
  await db.update(s.zones).set({ name: parsed.data, updatedAt: new Date() }).where(eq(s.zones.id, id));
  await writeAudit(db, { userId: admin.id, action: "update", entity: "zone", entityId: id, before, after: { ...before, name: parsed.data } });
}

const subzoneSchema = z.object({
  name,
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

async function assertUniqueSubzoneName(db: Db, zoneId: string, label: string, excludeId?: string) {
  const siblings = await db
    .select()
    .from(s.subzones)
    .where(and(eq(s.subzones.zoneId, zoneId), excludeId ? ne(s.subzones.id, excludeId) : undefined));
  if (siblings.some((sz) => normalizeLabel(sz.name) === normalizeLabel(label))) throw new AdminError("Ce poste existe déjà dans cette zone");
  return siblings;
}

/** Nouveau poste dans une zone : il reprend le mode d'attribution (équipe ou zone) des autres postes de la zone. */
export async function createSubzone(db: Db, admin: AuthUser, zoneId: string, raw: z.input<typeof subzoneSchema>) {
  requirePermission(admin, "referentiel.manage");
  const parsed = subzoneSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const siblings = await assertUniqueSubzoneName(db, zoneId, parsed.data.name);
  const modes = new Set(siblings.map((sz) => sz.teamMode));
  if (modes.size !== 1) throw new AdminError("Mode d'attribution de la zone inconnu : ajout impossible ici");
  const allCodes = (await db.select({ code: s.subzones.code }).from(s.subzones)).map((r) => r.code);
  const [created] = await db
    .insert(s.subzones)
    .values({
      zoneId,
      code: codeFrom(parsed.data.name, allCodes),
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      teamMode: [...modes][0]!,
      displayOrder: Math.max(-1, ...siblings.map((sz) => sz.displayOrder)) + 1,
    })
    .returning();
  await writeAudit(db, { userId: admin.id, action: "create", entity: "subzone", entityId: created!.id, after: created });
  return created!;
}

export async function updateSubzone(db: Db, admin: AuthUser, id: string, raw: z.input<typeof subzoneSchema>) {
  requirePermission(admin, "referentiel.manage");
  const parsed = subzoneSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const [before] = await db.select().from(s.subzones).where(eq(s.subzones.id, id));
  if (!before) throw new AdminError("Poste introuvable");
  await assertUniqueSubzoneName(db, before.zoneId, parsed.data.name, id);
  const [after] = await db
    .update(s.subzones)
    .set({ name: parsed.data.name, description: parsed.data.description ?? null, updatedAt: new Date() })
    .where(eq(s.subzones.id, id))
    .returning();
  await writeAudit(db, { userId: admin.id, action: "update", entity: "subzone", entityId: id, before, after });
}

export async function setSubzoneActive(db: Db, admin: AuthUser, id: string, active: boolean) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.subzones).where(eq(s.subzones.id, id));
  if (!before) throw new AdminError("Poste introuvable");
  if (!active) {
    const [others] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.subzones)
      .where(and(eq(s.subzones.zoneId, before.zoneId), eq(s.subzones.active, true), ne(s.subzones.id, id)));
    if ((others?.n ?? 0) === 0) throw new AdminError("Chaque zone doit garder au moins un poste actif");
  }
  await db.update(s.subzones).set({ active, updatedAt: new Date() }).where(eq(s.subzones.id, id));
  await writeAudit(db, { userId: admin.id, action: active ? "activate" : "deactivate", entity: "subzone", entityId: id, before });
}

export async function moveSubzone(db: Db, admin: AuthUser, id: string, direction: "up" | "down") {
  requirePermission(admin, "referentiel.manage");
  const [row] = await db.select().from(s.subzones).where(eq(s.subzones.id, id));
  if (!row) throw new AdminError("Poste introuvable");
  const siblings = await db
    .select()
    .from(s.subzones)
    .where(eq(s.subzones.zoneId, row.zoneId))
    .orderBy(asc(s.subzones.displayOrder), asc(s.subzones.name));
  await move(siblings, id, direction, (rowId, displayOrder) => db.update(s.subzones).set({ displayOrder }).where(eq(s.subzones.id, rowId)));
}
