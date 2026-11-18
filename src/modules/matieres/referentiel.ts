/**
 * Référentiel des matières premières tiré des tomes (docs/PHASE6.md, étape 6.7).
 * - Chaque ingrédient Melba devient un produit (`external_id` = « melba:<clé> »), créé au premier tome qui le cite.
 * - Un prix ou une unité qui change crée une version datée du début de la semaine du tome ; l'historique ne bouge
 *   pas (les pertes passées gardent leur coût figé).
 * - Le nom, l'état (actif ou non) et les autres réglages faits à la main ne sont jamais écrasés par un import.
 */
import { and, asc, eq, inArray, isNull, like, lte } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { referenceDensity } from "@/domain/densites";
import { isMelbaExternalId, melbaExternalId, priceInForce, samePrice, tomeMaterials } from "@/domain/matieres";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { isMouldLabel } from "@/modules/imports/merge";
import { tomeKey } from "@/modules/imports/tome/parse-tome";

export interface MaterialSyncResult {
  materials: number;
  created: number;
  linked: number;
  newPrices: number;
  densities: number;
}

/**
 * Densité de référence (liquides, décision du 18/11/2026) donnée aux matières qui n'en ont pas. Une densité déjà
 * renseignée, à la main ou non, n'est jamais remplacée.
 */
export async function applyReferenceDensities(db: Db, productIds?: readonly string[]): Promise<number> {
  if (productIds && !productIds.length) return 0;
  const rows = await db
    .select({ id: s.products.id, name: s.products.name })
    .from(s.products)
    .where(and(isNull(s.products.densityKgPerL), inArray(s.products.category, ["matiere_premiere"]), productIds ? inArray(s.products.id, [...productIds]) : undefined));
  let n = 0;
  for (const p of rows) {
    const ref = referenceDensity(p.name);
    if (!ref) continue;
    await db.update(s.products).set({ densityKgPerL: ref.densityKgPerL, updatedAt: new Date() }).where(eq(s.products.id, p.id));
    n++;
  }
  return n;
}

const gramsToKg = (g: number | null) => (g == null ? null : Math.round((g / 1000) * 10_000) / 10_000);

/**
 * Complète le référentiel avec les ingrédients d'un import de semaine (appelé à l'enregistrement de l'import,
 * dans la même transaction, et par la reprise des tomes déjà importés).
 */
export async function syncMaterialsFromImport(db: Db, importId: string, validFrom: string, userId: string | null): Promise<MaterialSyncResult> {
  const lines = await db
    .select({
      label: s.weekRecipeLines.label,
      key: s.weekRecipeLines.key,
      quantity: s.weekRecipeLines.quantity,
      unit: s.weekRecipeLines.unit,
      unitWeightG: s.weekRecipeLines.unitWeightG,
      costEur: s.weekRecipeLines.costEur,
    })
    .from(s.weekRecipeLines)
    .where(and(eq(s.weekRecipeLines.importId, importId), eq(s.weekRecipeLines.isSubRecipe, false)));
  const materials = tomeMaterials(lines);
  const result: MaterialSyncResult = { materials: materials.length, created: 0, linked: 0, newPrices: 0, densities: 0 };
  if (!materials.length) return result;

  const categories = ["matiere_premiere", "moule_plat_gratin"] as const;
  const existing = await db.select().from(s.products).where(inArray(s.products.category, [...categories]));
  // Matières déjà connues (tomes ou bons de commande), quelle que soit leur catégorie.
  const melba = await db.select().from(s.products).where(like(s.products.externalId, melbaExternalId("%")));
  const byExternalId = new Map(melba.filter((p) => isMelbaExternalId(p.externalId)).map((p) => [p.externalId!, p]));
  // Produit saisi à la main avant le référentiel : rattaché à la matière Melba de même nom plutôt que doublé.
  const manualByKey = new Map(existing.filter((p) => !p.externalId).map((p) => [`${p.category}|${tomeKey(`${p.name} ${p.variant ?? ""}`)}`, p]));

  const productIds = new Map<string, string>();
  for (const m of materials) {
    const externalId = melbaExternalId(m.key);
    const category = isMouldLabel(m.name) ? "moule_plat_gratin" : "matiere_premiere";
    const known = byExternalId.get(externalId);
    if (known) {
      productIds.set(m.key, known.id);
      continue;
    }
    const manual = manualByKey.get(`${category}|${m.key}`);
    if (manual) {
      await db.update(s.products).set({ externalId, updatedAt: new Date() }).where(eq(s.products.id, manual.id));
      manualByKey.delete(`${category}|${m.key}`);
      productIds.set(m.key, manual.id);
      result.linked++;
      continue;
    }
    const weighed = /^k?g$/i.test(m.unit);
    const [created] = await db
      .insert(s.products)
      .values({
        category,
        externalId,
        name: m.name,
        defaultUnit: weighed ? "kg" : "piece",
        unitWeightKg: weighed ? null : gramsToKg(m.unitWeightG),
        source: "tome",
      })
      .returning({ id: s.products.id });
    productIds.set(m.key, created!.id);
    result.created++;
  }

  const ids = [...productIds.values()];
  result.densities = await applyReferenceDensities(db, ids);
  const versions = await db
    .select()
    .from(s.productPrices)
    .where(and(inArray(s.productPrices.productId, ids), eq(s.productPrices.source, "tome")));
  const versionsOf = new Map<string, typeof versions>();
  for (const v of versions) versionsOf.set(v.productId, [...(versionsOf.get(v.productId) ?? []), v]);

  for (const m of materials) {
    if (m.cost.perKgEur == null && m.cost.perUnitEur == null) continue;
    const productId = productIds.get(m.key)!;
    const price = { unit: m.unit, unitWeightG: m.unitWeightG, perKgEur: m.cost.perKgEur, perUnitEur: m.cost.perUnitEur };
    const own = versionsOf.get(productId) ?? [];
    const sameWeek = own.find((v) => v.validFrom === validFrom);
    if (sameWeek) {
      // Nouvelle version de l'import de la même semaine : le tome corrigé remplace le prix de cette semaine.
      if (!samePrice(sameWeek, price)) {
        await db.update(s.productPrices).set({ ...price, weeklyImportId: importId, createdBy: userId, createdAt: new Date() }).where(eq(s.productPrices.id, sameWeek.id));
        result.newPrices++;
      }
      continue;
    }
    const before = priceInForce(own.filter((v) => v.validFrom < validFrom), validFrom);
    if (before && samePrice(before, price)) continue;
    await db.insert(s.productPrices).values({ productId, source: "tome", validFrom, ...price, weeklyImportId: importId, createdBy: userId });
    result.newPrices++;
  }
  return result;
}

/**
 * Reprise : construit le référentiel à partir de tous les tomes en vigueur, de la semaine la plus ancienne à la
 * plus récente. Sans effet sur ce qui existe déjà : on peut la relancer.
 */
export async function buildMaterialsFromTomes(db: Db, admin: AuthUser) {
  requirePermission(admin, "referentiel.manage");
  const imports = await db
    .select({ id: s.weeklyImports.id, startDate: s.productionWeeks.startDate, year: s.productionWeeks.year, number: s.productionWeeks.number })
    .from(s.weeklyImports)
    .innerJoin(s.productionWeeks, eq(s.weeklyImports.productionWeekId, s.productionWeeks.id))
    .where(eq(s.weeklyImports.status, "validee"))
    .orderBy(asc(s.productionWeeks.startDate));
  return db.transaction(async (tx) => {
    const total: MaterialSyncResult & { weeks: string[] } = { materials: 0, created: 0, linked: 0, newPrices: 0, densities: 0, weeks: [] };
    for (const imp of imports) {
      const r = await syncMaterialsFromImport(tx, imp.id, imp.startDate, admin.id);
      total.created += r.created;
      total.linked += r.linked;
      total.newPrices += r.newPrices;
      total.densities += r.densities;
      total.weeks.push(`S${imp.number}-${imp.year}`);
    }
    // Matières venues des seuls bons de commande.
    total.densities += await applyReferenceDensities(tx);
    total.materials = (await tx.select({ id: s.products.id }).from(s.products).where(like(s.products.externalId, melbaExternalId("%")))).length;
    await writeAudit(tx, { userId: admin.id, action: "build_materials", entity: "product", after: total });
    return total;
  });
}

/** Prix d'une matière en vigueur à la date d'une perte, ou null (pas de prix connu : jamais deviné). */
export async function materialPriceAt(db: Db, productId: string, on: string) {
  const versions = await db
    .select()
    .from(s.productPrices)
    .where(and(eq(s.productPrices.productId, productId), lte(s.productPrices.validFrom, on)));
  return priceInForce(versions, on);
}

/** Versions de prix d'une matière, de la plus récente à la plus ancienne (écran d'administration). */
export async function listMaterialPrices(db: Db, productId: string) {
  const rows = await db.select().from(s.productPrices).where(eq(s.productPrices.productId, productId));
  return rows.sort((a, b) => b.validFrom.localeCompare(a.validFrom) || a.source.localeCompare(b.source));
}

/** Prix en vigueur à une date pour tous les produits qui en ont un (liste de l'administration). */
export async function pricesInForce(db: Db, on: string) {
  const rows = await db.select().from(s.productPrices).where(lte(s.productPrices.validFrom, on));
  const byProduct = new Map<string, typeof rows>();
  for (const r of rows) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
  return new Map([...byProduct].map(([id, versions]) => [id, { current: priceInForce(versions, on)!, versions: versions.length }]));
}
