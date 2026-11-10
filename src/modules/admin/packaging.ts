/**
 * Référentiel des emballages et consommables (docs/PHASE3.md, étapes 3.1 et 3.2).
 * Coûts unitaires datés comme les tares : une nouvelle valeur s'applique à partir d'une date, la précédente est
 * clôturée la veille ; une valeur déjà entrée en vigueur n'est jamais réécrite.
 */
import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import { datedChange } from "@/domain/versions-datees";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { AdminError } from "./accounts";
import { normalizeCauseName as normalizeLabel } from "./causes";
import { PACKAGING_KINDS, PORTION_KINDS, type PortionKind } from "./packaging-labels";

export { PACKAGING_KINDS, PORTION_KINDS, type PortionKind } from "./packaging-labels";

const decimal = (message: string, { allowZero = false } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v),
    z.number({ message }).refine((n) => Number.isFinite(n) && (allowZero ? n >= 0 : n > 0), message),
  );

const itemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Indiquez un code interne")
    .max(40)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Le nom est trop court").max(120),
  kind: z.enum(PACKAGING_KINDS, { message: "Choisissez le type" }),
  unit: z.string().trim().min(1, "Indiquez l'unité").max(40),
  supplier: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

const costSchema = z.object({
  unitCostEur: decimal("Indiquez un coût unitaire (0 ou plus)", { allowZero: true }),
  validFrom: z.iso.date({ message: "Date de début invalide" }),
  note: z.string().trim().max(200).optional(),
});

export async function listPackaging(db: Db, admin: AuthUser, today: LocalDate) {
  requirePermission(admin, "referentiel.manage");
  const [items, costs, perPortion] = await Promise.all([
    db.select().from(s.packagingItems).orderBy(desc(s.packagingItems.active), asc(s.packagingItems.kind), asc(s.packagingItems.name)),
    db.select().from(s.packagingItemCosts).orderBy(desc(s.packagingItemCosts.validFrom)),
    db.select().from(s.packagingPerPortion),
  ]);
  return {
    items: items.map((item) => {
      const versions = costs.filter((c) => c.itemId === item.id);
      const current = versions.find((v) => v.validFrom <= today && (v.validTo == null || v.validTo >= today)) ?? null;
      return { ...item, versions, current };
    }),
    perPortion,
  };
}

export async function createPackagingItem(db: Db, admin: AuthUser, raw: z.input<typeof itemSchema>) {
  requirePermission(admin, "referentiel.manage");
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const existing = await db.select().from(s.packagingItems);
  if (existing.some((i) => i.code === parsed.data.code)) throw new AdminError("Ce code est déjà utilisé");
  if (existing.some((i) => normalizeLabel(i.name) === normalizeLabel(parsed.data.name))) throw new AdminError("Cet emballage existe déjà");
  const [created] = await db.insert(s.packagingItems).values(parsed.data).returning();
  await writeAudit(db, { userId: admin.id, action: "create", entity: "packaging_item", entityId: created!.id, after: created });
  return created!;
}

/** Le code interne ne change pas (il sert de référence) ; nom, type, unité et fournisseur sont modifiables. */
export async function updatePackagingItem(db: Db, admin: AuthUser, id: string, raw: Omit<z.input<typeof itemSchema>, "code">) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.packagingItems).where(eq(s.packagingItems.id, id));
  if (!before) throw new AdminError("Emballage introuvable");
  const parsed = itemSchema.omit({ code: true }).safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const others = await db.select().from(s.packagingItems);
  if (others.some((i) => i.id !== id && normalizeLabel(i.name) === normalizeLabel(parsed.data.name))) throw new AdminError("Cet emballage existe déjà");
  const [after] = await db
    .update(s.packagingItems)
    .set({ ...parsed.data, supplier: parsed.data.supplier ?? null, updatedAt: new Date() })
    .where(eq(s.packagingItems.id, id))
    .returning();
  await writeAudit(db, { userId: admin.id, action: "update", entity: "packaging_item", entityId: id, before, after });
}

export async function setPackagingItemActive(db: Db, admin: AuthUser, id: string, active: boolean) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.packagingItems).where(eq(s.packagingItems.id, id));
  if (!before) throw new AdminError("Emballage introuvable");
  await db.update(s.packagingItems).set({ active, updatedAt: new Date() }).where(eq(s.packagingItems.id, id));
  await writeAudit(db, { userId: admin.id, action: active ? "activate" : "deactivate", entity: "packaging_item", entityId: id, before });
}

/**
 * Enregistre un coût unitaire à partir d'une date.
 * - date postérieure à la dernière version : nouvelle version, la précédente est clôturée la veille ;
 * - même date que la dernière version, pas encore entrée en vigueur (aujourd'hui ou plus tard) : correction ;
 * - sinon refus : un coût déjà appliqué n'est jamais réécrit.
 */
export async function setPackagingCost(db: Db, admin: AuthUser, itemId: string, raw: z.input<typeof costSchema>, today: LocalDate) {
  requirePermission(admin, "referentiel.manage");
  const parsed = costSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(s.packagingItems).where(eq(s.packagingItems.id, itemId));
    if (!item) throw new AdminError("Emballage introuvable");
    const [latest] = await tx
      .select()
      .from(s.packagingItemCosts)
      .where(eq(s.packagingItemCosts.itemId, itemId))
      .orderBy(desc(s.packagingItemCosts.validFrom))
      .limit(1);
    const change = datedChange(latest, input.validFrom, today);
    if (change.kind === "refus") throw new AdminError(change.message);
    if (latest && change.kind === "correction") {
      const [after] = await tx
        .update(s.packagingItemCosts)
        .set({ unitCostEur: input.unitCostEur, source: input.note || null, createdBy: admin.id })
        .where(eq(s.packagingItemCosts.id, latest.id))
        .returning();
      await writeAudit(tx, { userId: admin.id, action: "cost_corrected", entity: "packaging_item_cost", entityId: latest.id, before: latest, after, reason: input.note || null });
      return after!;
    }
    if (latest) await tx.update(s.packagingItemCosts).set({ validTo: addDays(input.validFrom, -1) }).where(eq(s.packagingItemCosts.id, latest.id));
    const [created] = await tx
      .insert(s.packagingItemCosts)
      .values({ itemId, unitCostEur: input.unitCostEur, validFrom: input.validFrom, source: input.note || null, createdBy: admin.id })
      .returning();
    await writeAudit(tx, { userId: admin.id, action: "cost_new_version", entity: "packaging_item_cost", entityId: created!.id, before: latest ?? null, after: created, reason: input.note || null });
    return created!;
  });
}

/** Quantité d'un emballage consommée par portion (0 ou vide : l'emballage n'est plus compté). */
export async function setPackagingPerPortion(db: Db, admin: AuthUser, input: { portionKind: PortionKind; itemId: string; quantity: unknown }) {
  requirePermission(admin, "referentiel.manage");
  const text = String(input.quantity ?? "").trim().replace(",", ".");
  const quantity = text === "" ? 0 : Number(text);
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100) throw new AdminError("Quantité par portion invalide");
  if (!PORTION_KINDS.includes(input.portionKind)) throw new AdminError("Type de portion inconnu");
  const where = and(eq(s.packagingPerPortion.portionKind, input.portionKind), eq(s.packagingPerPortion.itemId, input.itemId));
  const [before] = await db.select().from(s.packagingPerPortion).where(where);
  if (quantity === 0) {
    if (before) await db.delete(s.packagingPerPortion).where(where);
  } else if (before) {
    await db.update(s.packagingPerPortion).set({ quantity, updatedAt: new Date() }).where(where);
  } else {
    await db.insert(s.packagingPerPortion).values({ portionKind: input.portionKind, itemId: input.itemId, quantity });
  }
  await writeAudit(db, {
    userId: admin.id,
    action: "packaging_per_portion",
    entity: "packaging_item",
    entityId: input.itemId,
    before: before ?? null,
    after: { portionKind: input.portionKind, quantity },
  });
}

export interface PortionPackagingCost {
  /** Total des emballages dont le coût est connu à cette date. */
  totalEur: number;
  lines: { itemId: string; code: string; name: string; quantity: number; unitCostEur: number | null }[];
  /** Faux si un emballage de la portion n'a pas de coût en vigueur à cette date (total incomplet). */
  complete: boolean;
}

/** Coût des emballages d'une portion (plat ou petit-déjeuner) aux prix en vigueur à une date. */
export async function portionPackagingCost(db: Db, portionKind: PortionKind, date: LocalDate): Promise<PortionPackagingCost> {
  const rows = await db
    .select({ item: s.packagingItems, perPortion: s.packagingPerPortion, cost: s.packagingItemCosts })
    .from(s.packagingPerPortion)
    .innerJoin(s.packagingItems, eq(s.packagingPerPortion.itemId, s.packagingItems.id))
    .leftJoin(
      s.packagingItemCosts,
      and(
        eq(s.packagingItemCosts.itemId, s.packagingItems.id),
        lte(s.packagingItemCosts.validFrom, date),
        or(isNull(s.packagingItemCosts.validTo), gte(s.packagingItemCosts.validTo, date)),
      ),
    )
    .where(and(eq(s.packagingPerPortion.portionKind, portionKind), eq(s.packagingItems.active, true)));
  const lines = rows.map((r) => ({
    itemId: r.item.id,
    code: r.item.code,
    name: r.item.name,
    quantity: r.perPortion.quantity,
    unitCostEur: r.cost?.unitCostEur ?? null,
  }));
  const totalEur = Math.round(lines.reduce((sum, l) => sum + (l.unitCostEur ?? 0) * l.quantity, 0) * 100_000) / 100_000;
  return { totalEur, lines, complete: lines.every((l) => l.unitCostEur != null) };
}
