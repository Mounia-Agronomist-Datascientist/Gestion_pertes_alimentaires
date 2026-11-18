import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { weeklyImports } from "./imports";
import { productionWeeks } from "./production-weeks";
import { materialCategories, products } from "./referentiels";

// ─── Fournisseurs et bons de commande (docs/PHASE6.md, étape 6.8) ────────────────

/** Fournisseur, d'après le nom des fichiers de bons de commande (dossiers du Drive). Aucun contact n'est gardé. */
export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Bon de commande Melba déposé ; un bon redéposé (même numéro) remplace ses lignes et passe à la version suivante. */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    /** Fournisseur tel qu'écrit par Melba dans l'en-tête (« Pro à Pro (Neg) »). */
    supplierLabel: text("supplier_label").notNull(),
    subject: text("subject"),
    weekNumber: smallint("week_number"),
    productionWeekId: uuid("production_week_id").references(() => productionWeeks.id),
    deliveryDate: date("delivery_date", { mode: "string" }).notNull(),
    orderedOn: date("ordered_on", { mode: "string" }),
    totalEur: numeric("total_eur", { precision: 12, scale: 2, mode: "number" }),
    fileName: text("file_name").notNull(),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
    importedBy: uuid("imported_by")
      .notNull()
      .references(() => users.id),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("purchase_orders_week_idx").on(t.productionWeekId),
    index("purchase_orders_delivery_idx").on(t.deliveryDate),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    position: smallint("position").notNull(),
    designation: text("designation").notNull(),
    /** Clé de rapprochement avec les ingrédients des tomes (même calcul que la clé du tome). */
    key: text("key").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    supplierCode: text("supplier_code"),
    materialCategoryId: uuid("material_category_id").references(() => materialCategories.id),
    quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
    packagingLabel: text("packaging_label"),
    contentQuantity: numeric("content_quantity", { precision: 12, scale: 3, mode: "number" }),
    contentUnit: text("content_unit"),
    unitPriceEur: numeric("unit_price_eur", { precision: 12, scale: 4, mode: "number" }).notNull(),
    priceUnit: text("price_unit").notNull(),
    totalEur: numeric("total_eur", { precision: 12, scale: 2, mode: "number" }),
    /** Prix ramené au kg ou à la pièce (null quand le bon ne permet pas de le calculer). */
    perKgEur: numeric("per_kg_eur", { precision: 12, scale: 4, mode: "number" }),
    perUnitEur: numeric("per_unit_eur", { precision: 12, scale: 4, mode: "number" }),
  },
  (t) => [
    index("purchase_order_lines_order_idx").on(t.orderId),
    index("purchase_order_lines_product_idx").on(t.productId),
  ],
);

/** Colis fournisseur d'une matière : le dernier commandé chez ce fournisseur. */
export const supplierProducts = pgTable(
  "supplier_products",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    supplierCode: text("supplier_code"),
    packagingLabel: text("packaging_label"),
    contentQuantity: numeric("content_quantity", { precision: 12, scale: 3, mode: "number" }),
    contentUnit: text("content_unit"),
    lastOrderId: uuid("last_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    lastDeliveryDate: date("last_delivery_date", { mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.supplierId] })],
);

/**
 * Colis fournisseur saisi à la main (étape 6.11, décision du 18/11/2026) : pour l'information seulement, gardé à côté
 * du colis lu dans les bons (jamais remplacé par un bon), un par produit et par fournisseur.
 */
export const manualPackagings = pgTable(
  "manual_packagings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    supplierCode: text("supplier_code"),
    packagingLabel: text("packaging_label").notNull(),
    contentQuantity: numeric("content_quantity", { precision: 12, scale: 3, mode: "number" }),
    contentUnit: text("content_unit"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("manual_packagings_product_supplier_key").on(t.productId, t.supplierId),
    check("manual_packagings_content_positive", sql`${t.contentQuantity} is null or ${t.contentQuantity} > 0`),
  ],
);

// ─── Prix datés ──────────────────────────────────────────────────────────────

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
    /** Bon de commande d'origine (source `bon_commande`). */
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_prices_version_key").on(t.productId, t.source, t.validFrom),
    index("product_prices_product_idx").on(t.productId, t.validFrom),
    check("product_prices_known", sql`${t.perKgEur} is not null or ${t.perUnitEur} is not null`),
    check(
      "product_prices_positive",
      sql`(${t.perKgEur} is null or ${t.perKgEur} >= 0) and (${t.perUnitEur} is null or ${t.perUnitEur} >= 0)`,
    ),
  ],
);
