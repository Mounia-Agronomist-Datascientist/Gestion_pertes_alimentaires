/**
 * Référentiel des produits, saisi à la main en attendant l'import du plan de production et du tome
 * (Phase 2), et revue des produits saisis « hors liste » par les équipes.
 * Un produit est désactivé plutôt que supprimé : les déclarations gardent le nom saisi à l'époque. Il ne peut être
 * supprimé que s'il n'a aucun historique (ni perte, ni ligne de bon de commande, ni prix des tomes) — décision du
 * 26/11/2026, docs/REGLES_METIER.md R47.
 */
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORIES } from "@/modules/declarations/input";
import { linkDeclarationsToProduct, priceUnlistedDeclarations } from "@/modules/declarations/service";
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
const optionalPositive = z
  .preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.number({ message: "Nombre invalide" }).positive("La valeur doit être positive").nullable(),
  )
  .optional();

const productSchema = z.object({
  name: z.string().trim().min(2, "Le nom du produit est trop court").max(200),
  category: z.enum(PRODUCT_CATEGORIES, { message: "Choisissez le type de produit" }),
  code: optionalText(40),
  variant: optionalText(120),
  /** Famille d'un encas (« Fromages »…), pour ranger la liste des encas à la saisie. */
  snackFamily: optionalText(80),
  defaultUnit: z.string().min(1, "Choisissez l'unité"),
  unitWeightKg: optionalPositive,
  densityKgPerL: optionalPositive,
  /** Commentaire libre de l'administration (décision du 26/11/2026). */
  comment: optionalText(1000),
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
  const [created] = await db
    .insert(s.products)
    .values({ ...input, source: "manuel" })
    .returning();
  await writeAudit(db, {
    userId: admin.id,
    action: "create",
    entity: "product",
    entityId: created!.id,
    after: created,
  });
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
  await writeAudit(db, {
    userId: admin.id,
    action: active ? "activate" : "deactivate",
    entity: "product",
    entityId: productId,
    before,
  });
}

/** Ce qui empêche de supprimer un article : son historique (pertes, bons de commande, prix des tomes). */
export interface ProductHistory {
  losses: number;
  orderLines: number;
  tomePrices: number;
}

export const isDeletable = (h: ProductHistory | undefined) =>
  !h || (h.losses === 0 && h.orderLines === 0 && h.tomePrices === 0);

/** Historique de chaque article qui en a un (les autres sont absents de la table). */
export async function productHistories(db: Db, productIds?: string[]): Promise<Map<string, ProductHistory>> {
  const ids = productIds?.length ? productIds : ["00000000-0000-0000-0000-000000000000"];
  const only = (col: typeof s.lossDeclarations.productId | typeof s.purchaseOrderLines.productId) =>
    productIds ? inArray(col, ids) : undefined;
  const [losses, lines, prices] = await Promise.all([
    db
      .select({ id: s.lossDeclarations.productId, n: sql<number>`count(*)::int` })
      .from(s.lossDeclarations)
      .where(only(s.lossDeclarations.productId))
      .groupBy(s.lossDeclarations.productId),
    db
      .select({ id: s.purchaseOrderLines.productId, n: sql<number>`count(*)::int` })
      .from(s.purchaseOrderLines)
      .where(only(s.purchaseOrderLines.productId))
      .groupBy(s.purchaseOrderLines.productId),
    db
      .select({ id: s.productPrices.productId, n: sql<number>`count(*)::int` })
      .from(s.productPrices)
      .where(
        and(ne(s.productPrices.source, "manuel"), productIds ? inArray(s.productPrices.productId, ids) : undefined),
      )
      .groupBy(s.productPrices.productId),
  ]);
  const map = new Map<string, ProductHistory>();
  const add = (rows: { id: string | null; n: number }[], key: keyof ProductHistory) => {
    for (const r of rows) {
      if (!r.id) continue;
      const h = map.get(r.id) ?? { losses: 0, orderLines: 0, tomePrices: 0 };
      h[key] = r.n;
      map.set(r.id, h);
    }
  };
  add(losses, "losses");
  add(lines, "orderLines");
  add(prices, "tomePrices");
  return map;
}

/**
 * Supprime un article sans historique (article ajouté par erreur, doublon jamais utilisé) avec ses colis et prix
 * saisis à la main. Un article qui a des pertes se fusionne ou se désactive : ses pertes ne sont jamais effacées (R5).
 */
export async function deleteProduct(db: Db, admin: AuthUser, productId: string, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!before) throw new AdminError("Article introuvable");
  const history = (await productHistories(db, [productId])).get(productId);
  if (!isDeletable(history)) {
    throw new AdminError(
      history!.losses
        ? "Cet article a des pertes enregistrées : fusionnez-le avec le bon article ou désactivez-le."
        : "Cet article vient des tomes ou des bons de commande : désactivez-le plutôt.",
    );
  }
  await db.transaction(async (tx) => {
    await tx.delete(s.productPrices).where(eq(s.productPrices.productId, productId));
    await tx.delete(s.manualPackagings).where(eq(s.manualPackagings.productId, productId));
    await tx.delete(s.supplierProducts).where(eq(s.supplierProducts.productId, productId));
    await tx.delete(s.products).where(eq(s.products.id, productId));
  });
  await writeAudit(db, {
    userId: admin.id,
    action: "delete",
    entity: "product",
    entityId: productId,
    before,
    occurredAt: now,
  });
  return before.name;
}

/** Commentaire de l'administration sur un article, sans toucher au reste de sa fiche. */
export async function setProductComment(db: Db, admin: AuthUser, productId: string, raw: string) {
  requirePermission(admin, "referentiel.manage");
  const comment = raw.trim().slice(0, 1000) || null;
  const [before] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!before) throw new AdminError("Article introuvable");
  await db.update(s.products).set({ comment, updatedAt: new Date() }).where(eq(s.products.id, productId));
  await writeAudit(db, {
    userId: admin.id,
    action: "update",
    entity: "product",
    entityId: productId,
    before: { comment: before.comment },
    after: { comment },
  });
}

export interface UnlistedGroup {
  /** Clé de regroupement : type de produit + nom normalisé. */
  key: string;
  label: string;
  category: (typeof PRODUCT_CATEGORIES)[number];
  count: number;
  lastOccurredOn: string;
  /** Plus ancienne saisie du groupe (date d'effet d'un prix créé avec le produit). */
  firstOccurredOn: string;
  declarationIds: string[];
  /** Saisies chiffrées (prix indiqué à la saisie ou après coup). */
  priced: number;
  /** Dernier prix indiqué, s'il y en a un. */
  freePrice: { amountEur: number; per: "kg" | "piece" } | null;
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
      grossCostEur: s.lossDeclarations.grossCostEur,
      costDetails: s.lossDeclarations.costDetails,
    })
    .from(s.lossDeclarations)
    .where(
      and(eq(s.lossDeclarations.productUnlisted, true), inArray(s.lossDeclarations.status, ["validee", "corrigee"])),
    )
    .orderBy(desc(s.lossDeclarations.occurredOn));
  const groups = new Map<string, UnlistedGroup>();
  for (const r of rows) {
    const key = `${r.category}:${normalizeLabel(r.name)}`;
    const freePrice = (r.costDetails as { freePrice?: UnlistedGroup["freePrice"] } | null)?.freePrice ?? null;
    const group = groups.get(key);
    if (group) {
      group.count++;
      group.declarationIds.push(r.id);
      group.firstOccurredOn = r.occurredOn;
      if (r.grossCostEur != null) group.priced++;
      group.freePrice ??= freePrice;
    } else {
      groups.set(key, {
        key,
        label: r.name,
        category: r.category,
        count: 1,
        lastOccurredOn: r.occurredOn,
        firstOccurredOn: r.occurredOn,
        declarationIds: [r.id],
        priced: r.grossCostEur != null ? 1 : 0,
        freePrice,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));
}

export async function countUnlistedDeclarations(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.lossDeclarations)
    .where(
      and(eq(s.lossDeclarations.productUnlisted, true), inArray(s.lossDeclarations.status, ["validee", "corrigee"])),
    );
  return row?.n ?? 0;
}

/** Prix d'achat indiqué après coup pour toutes les saisies d'un groupe « hors liste » (décision du 20/11/2026). */
export async function priceUnlistedGroup(db: Db, admin: AuthUser, groupKey: string, price: unknown, now = new Date()) {
  const group = (await listUnlistedGroups(db, admin)).find((g) => g.key === groupKey);
  if (!group) throw new AdminError("Ces saisies ont déjà été rattachées");
  return priceUnlistedDeclarations(db, admin, { declarationIds: group.declarationIds, price }, now);
}

/** Rattache toutes les saisies d'un groupe « hors liste » à un produit existant. */
export async function linkUnlistedGroup(
  db: Db,
  admin: AuthUser,
  groupKey: string,
  productId: string,
  now = new Date(),
) {
  const group = (await listUnlistedGroups(db, admin)).find((g) => g.key === groupKey);
  if (!group) throw new AdminError("Ces saisies ont déjà été rattachées");
  return linkDeclarationsToProduct(db, admin, { declarationIds: group.declarationIds, productId }, now);
}

// ─── Articles saisis à la main en Réception ou Stockage (décision du 23/11/2026) ─────────────────────────────

/** Articles « saisis à la main — à valider » : fournisseur indiqué, qui l'a saisi, nombre de pertes. */
export async function listEnteredArticles(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const rows = await db
    .select({
      product: s.products,
      supplier: s.suppliers.name,
      supplierToValidate: s.suppliers.toValidate,
      enteredBy: s.users.displayName,
    })
    .from(s.products)
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.products.manualSupplierId))
    .leftJoin(s.users, eq(s.users.id, s.products.enteredBy))
    .where(and(eq(s.products.toValidate, true), eq(s.products.active, true)))
    .orderBy(desc(s.products.createdAt));
  if (!rows.length) return [];
  const counts = await db
    .select({ productId: s.lossDeclarations.productId, n: sql<number>`count(*)::int` })
    .from(s.lossDeclarations)
    .where(
      and(
        inArray(
          s.lossDeclarations.productId,
          rows.map((r) => r.product.id),
        ),
        ne(s.lossDeclarations.status, "annulee"),
      ),
    )
    .groupBy(s.lossDeclarations.productId);
  const countOf = new Map(counts.map((c) => [c.productId, c.n]));
  return rows.map((r) => ({
    id: r.product.id,
    name: r.product.name,
    category: r.product.category,
    supplier: r.supplier,
    supplierId: r.product.manualSupplierId,
    supplierToValidate: r.supplierToValidate ?? false,
    enteredBy: r.enteredBy,
    comment: r.product.comment,
    createdAt: r.product.createdAt,
    declarations: countOf.get(r.product.id) ?? 0,
  }));
}

/** Valide un article saisi à la main : il devient un article ordinaire de la liste. */
export async function validateEnteredArticle(db: Db, admin: AuthUser, productId: string, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const [before] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!before?.toValidate) throw new AdminError("Article introuvable ou déjà validé");
  await db.update(s.products).set({ toValidate: false, updatedAt: now }).where(eq(s.products.id, productId));
  await writeAudit(db, {
    userId: admin.id,
    action: "validate_entered_article",
    entity: "product",
    entityId: productId,
    before: { toValidate: true },
    after: { toValidate: false },
    occurredAt: now,
  });
}

/**
 * Fusionne un article saisi à la main avec un article de la liste (doublon, faute de frappe) : ses pertes passent sur
 * l'article choisi (coût recalculé à son prix), puis il est désactivé.
 */
export async function mergeEnteredArticle(
  db: Db,
  admin: AuthUser,
  productId: string,
  targetId: string,
  now = new Date(),
): Promise<number> {
  requirePermission(admin, "referentiel.manage");
  if (productId === targetId) throw new AdminError("Choisissez un autre article");
  const [source] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!source?.toValidate || !source.active) throw new AdminError("Article introuvable ou déjà validé");
  const declarations = await db
    .select({ id: s.lossDeclarations.id })
    .from(s.lossDeclarations)
    .where(and(eq(s.lossDeclarations.productId, productId), ne(s.lossDeclarations.status, "annulee")));
  const moved = declarations.length
    ? await linkDeclarationsToProduct(
        db,
        admin,
        { declarationIds: declarations.map((d) => d.id), productId: targetId, fromProductId: productId },
        now,
      )
    : 0;
  await db
    .update(s.products)
    .set({ active: false, toValidate: false, updatedAt: now })
    .where(eq(s.products.id, productId));
  await writeAudit(db, {
    userId: admin.id,
    action: "merge_entered_article",
    entity: "product",
    entityId: productId,
    before: { name: source.name },
    after: { mergedInto: targetId, declarations: moved },
    occurredAt: now,
  });
  return moved;
}

/** Valide un fournisseur tapé à la saisie d'un article. */
export async function validateSupplier(db: Db, admin: AuthUser, supplierId: string, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  await db.update(s.suppliers).set({ toValidate: false, updatedAt: now }).where(eq(s.suppliers.id, supplierId));
  await writeAudit(db, {
    userId: admin.id,
    action: "validate_supplier",
    entity: "supplier",
    entityId: supplierId,
    after: { toValidate: false },
    occurredAt: now,
  });
}
