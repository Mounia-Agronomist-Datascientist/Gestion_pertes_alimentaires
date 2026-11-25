/**
 * Liste interne des encas complétée par le PDF Melba des encas (décision du 25/11/2026, règle R41) : poids d'un encas
 * et prix datés du début de la semaine de production de chaque recette. Un changement de prix ou de poids crée une
 * nouvelle version ; les pertes passées gardent leur poids et leur coût figés. Un nouvel article devient un encas.
 * Le nom, la famille et l'état (actif ou non) réglés par l'administration ne sont jamais écrasés.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type SnackFact, snackFacts } from "@/domain/encas-tome";
import { melbaExternalId, priceInForce, samePrice } from "@/domain/matieres";
import { writeAudit } from "@/modules/audit/audit";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";

export class SnackTomeError extends Error {}

const finite = z.number().finite();
/** Forme envoyée par l'écran : seules les recettes d'encas lues dans le PDF (aucun fichier envoyé). */
export const snackTomePayloadSchema = z.object({
  fileName: z.string().min(1).max(200),
  recipes: z
    .array(
      z.object({
        year: z.number().int().min(2000).max(2100),
        week: z.number().int().min(1).max(53),
        code: z.string().regex(/^EN\d{1,3}(?:_[A-Z]{2,3})?$/),
        name: z.string().min(1).max(300),
        lines: z
          .array(
            z.object({
              label: z.string().min(1).max(300),
              key: z.string().max(300),
              isSubRecipe: z.boolean(),
              quantity: finite,
              unit: z.string().max(80),
              unitWeightG: finite.nullable(),
              cost: finite.nullable(),
            }),
          )
          .max(50),
        total: z.object({ quantity: finite, unit: z.string().max(80), cost: finite.nullable() }).nullable(),
      }),
    )
    .min(1, "Aucun encas (recette EN…) dans ce fichier")
    .max(2000),
});
export type SnackTomePayload = z.infer<typeof snackTomePayloadSchema>;

export interface SnackTomeResult {
  /** Semaines lues (« S45-2026 »). */
  weeks: string[];
  /** Encas distincts du fichier (articles et encas composés). */
  snacks: number;
  created: number;
  composites: number;
  newPrices: number;
  newWeights: number;
  /** Semaines absentes du calendrier : ignorées. */
  skipped: string[];
}

export const COMPOSITE_SNACK_PREFIX = "encas:";
const externalIdOf = (f: SnackFact) => (f.composite ? `${COMPOSITE_SNACK_PREFIX}${f.key}` : melbaExternalId(f.key));
const weekLabel = (f: { year: number; week: number }) => `S${String(f.week).padStart(2, "0")}-${f.year}`;
const kgOf = (g: number | null) => (g == null || g <= 0 ? null : Math.round((g / 1000) * 10_000) / 10_000);

export async function importSnackTome(db: Db, admin: AuthUser, payload: SnackTomePayload, now = new Date()) {
  requirePermission(admin, "referentiel.manage");
  const facts = snackFacts(payload.recipes);
  if (!facts.length) throw new SnackTomeError("Aucun encas (recette EN…) dans ce fichier");

  const pairs = [...new Map(facts.map((f) => [weekLabel(f), f])).values()];
  const weekRows = await db
    .select()
    .from(s.productionWeeks)
    .where(or(...pairs.map((p) => and(eq(s.productionWeeks.year, p.year), eq(s.productionWeeks.number, p.week)))));
  const startOf = new Map(weekRows.map((w) => [weekLabel({ year: w.year, week: w.number }), w.startDate]));
  const result: SnackTomeResult = {
    weeks: pairs.map(weekLabel),
    snacks: new Set(facts.map(externalIdOf)).size,
    created: 0,
    composites: 0,
    newPrices: 0,
    newWeights: 0,
    skipped: pairs.map(weekLabel).filter((w) => !startOf.has(w)),
  };
  if (result.skipped.length === pairs.length) {
    throw new SnackTomeError(
      `Semaine${pairs.length > 1 ? "s" : ""} absente${pairs.length > 1 ? "s" : ""} du calendrier : ${result.skipped.join(", ")}`,
    );
  }

  return db.transaction(async (tx) => {
    const externalIds = [...new Set(facts.map(externalIdOf))];
    const known = await tx.select().from(s.products).where(inArray(s.products.externalId, externalIds));
    const byExternalId = new Map(known.map((p) => [p.externalId!, p]));
    const versions = known.length
      ? await tx
          .select()
          .from(s.productPrices)
          .where(
            inArray(
              s.productPrices.productId,
              known.map((p) => p.id),
            ),
          )
      : [];
    const versionsOf = new Map<string, (typeof versions)[number][]>();
    for (const v of versions) versionsOf.set(v.productId, [...(versionsOf.get(v.productId) ?? []), v]);
    // Semaine la plus récente déjà lue dans un tome pour chaque encas : un fichier plus ancien ne change pas son poids.
    const latestTome = new Map<string, string>();
    for (const v of versions)
      if (v.source === "tome" && v.validFrom > (latestTome.get(v.productId) ?? ""))
        latestTome.set(v.productId, v.validFrom);

    for (const f of facts) {
      const validFrom = startOf.get(weekLabel(f));
      if (!validFrom) continue;
      const externalId = externalIdOf(f);
      let product = byExternalId.get(externalId);
      if (!product) {
        const family = f.composite
          ? commonFamily(f.articleKeys.map((k) => byExternalId.get(melbaExternalId(k))))
          : null;
        [product] = await tx
          .insert(s.products)
          .values({
            category: "produit_externe",
            externalId,
            name: f.name,
            defaultUnit: "piece",
            unitWeightKg: kgOf(f.unitWeightG),
            source: "tome_encas",
            snackFamily: family,
          })
          .returning();
        byExternalId.set(externalId, product!);
        result.created++;
        if (f.composite) result.composites++;
      } else {
        // Un article cité par une recette d'encas est un encas (comme pour la liste de départ, R29).
        const patch: Partial<typeof s.products.$inferInsert> = {};
        if (product.category !== "produit_externe") patch.category = "produit_externe";
        const weightKg = kgOf(f.unitWeightG);
        const newer = validFrom >= (latestTome.get(product.id) ?? "");
        if (weightKg != null && (product.unitWeightKg == null || (newer && product.unitWeightKg !== weightKg))) {
          patch.unitWeightKg = weightKg;
          result.newWeights++;
        }
        if (Object.keys(patch).length) {
          [product] = await tx
            .update(s.products)
            .set({ ...patch, updatedAt: now })
            .where(eq(s.products.id, product.id))
            .returning();
          byExternalId.set(externalId, product!);
        }
      }
      const productId = product!.id;
      if (validFrom > (latestTome.get(productId) ?? "")) latestTome.set(productId, validFrom);

      if (f.cost.perKgEur == null && f.cost.perUnitEur == null) continue;
      const price = {
        unit: f.unit,
        unitWeightG: f.unitWeightG,
        perKgEur: f.cost.perKgEur,
        perUnitEur: f.cost.perUnitEur,
      };
      const own = (versionsOf.get(productId) ?? []).filter((v) => v.source === "tome");
      const sameWeek = own.find((v) => v.validFrom === validFrom);
      if (sameWeek) {
        if (!samePrice(sameWeek, price)) {
          await tx
            .update(s.productPrices)
            .set({ ...price, createdBy: admin.id, createdAt: now })
            .where(eq(s.productPrices.id, sameWeek.id));
          Object.assign(sameWeek, price);
          result.newPrices++;
        }
        continue;
      }
      const before = priceInForce(
        own.filter((v) => v.validFrom < validFrom),
        validFrom,
      );
      if (before && samePrice(before, price)) continue;
      const [inserted] = await tx
        .insert(s.productPrices)
        .values({ productId, source: "tome", validFrom, ...price, createdBy: admin.id, createdAt: now })
        .returning();
      versionsOf.set(productId, [...(versionsOf.get(productId) ?? []), inserted!]);
      result.newPrices++;
    }

    await writeAudit(tx, {
      userId: admin.id,
      action: "import_encas",
      entity: "products",
      after: { file: payload.fileName, ...result },
      occurredAt: now,
    });
    return result;
  });
}

/** Famille commune des articles d'un encas composé (trio de fromages → « Fromages »), sinon null. */
function commonFamily(articles: readonly ({ snackFamily: string | null } | undefined)[]) {
  const families = new Set(articles.map((a) => a?.snackFamily ?? null));
  if (families.size !== 1) return null;
  return [...families][0] ?? null;
}
