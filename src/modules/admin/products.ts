/**
 * Référentiel des produits, saisi à la main en attendant l'import du plan de production et du tome
 * (Phase 2), et revue des produits saisis « hors liste » par les équipes.
 * Un produit n'est jamais supprimé : il est désactivé. Les déclarations gardent le nom saisi à l'époque.
 */
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORIES } from "@/modules/declarations/input";
import { linkDeclarationsToProduct } from "@/modules/declarations/service";
import { AdminError } from "./accounts";
import { normalizeCauseName as normalizeLabel } from "./causes";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
// Valeurs connues uniquement (docs/REGLES_METIER.md R2) : vide = inconnu, jamais une valeur par défaut.
const optionalPositive = z.preprocess(
  (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(",", ".")) : v),
  z.number({ message: "Nombre invalide" }).positive("La valeur doit être positive").nullable(),
).optional();

const productSchema = z.object({
  name: z.string().trim().min(2, "Le nom du produit est trop court").max(200),
  category: z.enum(PRODUCT_CATEGORIES, { message: "Choisissez le type de produit" }),
  code: optionalText(40),
  variant: optionalText(120),
  defaultUnit: z.string().min(1, "Choisissez l'unité"),
  unitWeightKg: optionalPositive,
  densityKgPerL: optionalPositive,
});

export type ProductInput = z.input<typeof productSchema>;

async function validate(db: Db, raw: unknown, excludeId?: string) {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "Saisie invalide");
  const input = parsed.data;
  const [unit] = await db.select().from(s.units).where(eq(s.units.code, input.defaultUnit));
  if (!unit || !unit.active) throw new AdminError("Unité inconnue");

  const others = await db
    .select()
    .from(s.products)
    .where(and(eq(s.products.category, input.category), excludeId ? ne(s.products.id, excludeId) : undefined));
  const key = normalizeLabel(`${input.name} ${input.variant ?? ""}`);
  if (others.some((p) => normalizeLabel(`${p.name} ${p.variant ?? ""}`) === key)) {
    throw new AdminError("Ce produit existe déjà dans ce type de produit");
  }
  if (input.code && others.some((p) => p.code?.toLowerCase() === input.code!.toLowerCase())) {
    throw new AdminError("Ce code est déjà utilisé dans ce type de produit");
  }
  return input;
}

export async function listProductsForAdmin(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  return db.select().from(s.products).orderBy(desc(s.products.active), asc(s.products.name));
}

export async function createProduct(db: Db, admin: AuthUser, raw: ProductInput) {
  requirePermission(admin, "referentiel.manage");
  const input = await validate(db, raw);
  const [created] = await db.insert(s.products).values({ ...input, source: "manuel" }).returning();
  await writeAudit(db, { userId: admin.id, action: "create", entity: "product", entityId: created!.id, after: created });
  return created!;
}

/** Les déclarations passées gardent le nom et le poids enregistrés à l'époque. */
export async function updateProduct(db: Db, admin: AuthUser, productId: string, raw: ProductInput) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!before) throw new AdminError("Produit introuvable");
  const input = await validate(db, raw, productId);
  const [after] = await db
    .update(s.products)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(s.products.id, productId))
    .returning();
  await writeAudit(db, { userId: admin.id, action: "update", entity: "product", entityId: productId, before, after });
}

export async function setProductActive(db: Db, admin: AuthUser, productId: string, active: boolean) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!before) throw new AdminError("Produit introuvable");
  await db.update(s.products).set({ active, updatedAt: new Date() }).where(eq(s.products.id, productId));
  await writeAudit(db, { userId: admin.id, action: active ? "activate" : "deactivate", entity: "product", entityId: productId, before });
}

export interface UnlistedGroup {
  /** Clé de regroupement : type de produit + nom normalisé. */
  key: string;
  label: string;
  category: (typeof PRODUCT_CATEGORIES)[number];
  count: number;
  lastOccurredOn: string;
  declarationIds: string[];
}

/** Saisies « hors liste » à revoir, regroupées par nom (sans accents ni majuscules) et type de produit. */
export async function listUnlistedGroups(db: Db, admin: AuthUser): Promise<UnlistedGroup[]> {
  requirePermission(admin, "referentiel.manage");
  const rows = await db
    .select({
      id: s.lossDeclarations.id,
      name: s.lossDeclarations.productName,
      category: s.lossDeclarations.productCategory,
      occurredOn: s.lossDeclarations.occurredOn,
    })
    .from(s.lossDeclarations)
    .where(and(eq(s.lossDeclarations.productUnlisted, true), inArray(s.lossDeclarations.status, ["validee", "corrigee"])))
    .orderBy(desc(s.lossDeclarations.occurredOn));
  const groups = new Map<string, UnlistedGroup>();
  for (const r of rows) {
    const key = `${r.category}:${normalizeLabel(r.name)}`;
    const group = groups.get(key);
    if (group) {
      group.count++;
      group.declarationIds.push(r.id);
    } else {
      groups.set(key, { key, label: r.name, category: r.category, count: 1, lastOccurredOn: r.occurredOn, declarationIds: [r.id] });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}

export async function countUnlistedDeclarations(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.lossDeclarations)
    .where(and(eq(s.lossDeclarations.productUnlisted, true), inArray(s.lossDeclarations.status, ["validee", "corrigee"])));
  return row?.n ?? 0;
}

/** Rattache toutes les saisies d'un groupe « hors liste » à un produit existant. */
export async function linkUnlistedGroup(db: Db, admin: AuthUser, groupKey: string, productId: string, now = new Date()) {
  const group = (await listUnlistedGroups(db, admin)).find((g) => g.key === groupKey);
  if (!group) throw new AdminError("Ces saisies ont déjà été rattachées");
  return linkDeclarationsToProduct(db, admin, { declarationIds: group.declarationIds, productId }, now);
}
