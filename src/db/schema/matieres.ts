import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { weeklyImports } from "./imports";
import { products } from "./referentiels";

/**
 * Référentiel des matières premières (docs/PHASE6.md, étape 6.7). Une matière est un produit (`products`,
 * `external_id` = « melba:<clé du tome> ») ; ses prix sont des versions datées, jamais modifiées après coup :
 * un changement crée une nouvelle version et les pertes passées gardent le coût figé à leur enregistrement.
 */
export const priceSourceEnum = pgEnum("price_source", ["tome", "bon_commande", "manuel"]);

export const productPrices = pgTable(
  "product_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    source: priceSourceEnum("source").notNull(),
    /** Premier jour d'application : début de la semaine de production du tome (ou du bon de commande). */
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    /** Unité d'utilisation du tome (« g », « pot (125 g) »…), telle qu'imprimée. */
    unit: text("unit"),
    unitWeightG: numeric("unit_weight_g", { precision: 12, scale: 3, mode: "number" }),
    perKgEur: numeric("per_kg_eur", { precision: 12, scale: 4, mode: "number" }),
    perUnitEur: numeric("per_unit_eur", { precision: 12, scale: 4, mode: "number" }),
    weeklyImportId: uuid("weekly_import_id").references(() => weeklyImports.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_prices_version_key").on(t.productId, t.source, t.validFrom),
    index("product_prices_product_idx").on(t.productId, t.validFrom),
    check("product_prices_known", sql`${t.perKgEur} is not null or ${t.perUnitEur} is not null`),
    check("product_prices_positive", sql`(${t.perKgEur} is null or ${t.perKgEur} >= 0) and (${t.perUnitEur} is null or ${t.perUnitEur} >= 0)`),
  ],
);
