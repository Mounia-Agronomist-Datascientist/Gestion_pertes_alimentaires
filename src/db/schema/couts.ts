import { sql } from "drizzle-orm";
import { boolean, check, date, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { zones } from "./organisation";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Référentiel des emballages et consommables (cahier des charges §18.3, docs/PHASE3.md).
 * Les emballages ne sont pas entièrement référencés dans Melba : ce référentiel les complète.
 */
export const packagingKindEnum = pgEnum("packaging_kind", ["barquette", "film", "etiquette", "moule", "plat", "gastro", "autre"]);

export const packagingItems = pgTable(
  "packaging_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: packagingKindEnum("kind").notNull(),
    /** Unité du coût unitaire (pièce, mètre, rouleau…). */
    unit: text("unit").notNull(),
    supplier: text("supplier"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("packaging_items_code_key").on(t.code)],
);

/** Coût unitaire daté : une nouvelle valeur s'applique à partir d'une date, la précédente est clôturée la veille. */
export const packagingItemCosts = pgTable(
  "packaging_item_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => packagingItems.id),
    unitCostEur: numeric("unit_cost_eur", { precision: 12, scale: 5, mode: "number" }).notNull(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }),
    source: text("source"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("packaging_item_costs_item_valid_from_key").on(t.itemId, t.validFrom),
    check("packaging_item_costs_positive", sql`${t.unitCostEur} >= 0`),
    check("packaging_item_costs_period", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
  ],
);

/**
 * Emballages consommés par portion (décision du 10/11/2026 : toujours comptés pour un plat perdu).
 * `portion_kind` : plat ou petit-déjeuner ; une ligne par emballage et quantité par portion.
 */
export const portionKindEnum = pgEnum("portion_kind", ["plat", "petit_dejeuner"]);

export const packagingPerPortion = pgTable(
  "packaging_per_portion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portionKind: portionKindEnum("portion_kind").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => packagingItems.id),
    quantity: numeric("quantity", { precision: 10, scale: 4, mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique("packaging_per_portion_kind_item_key").on(t.portionKind, t.itemId),
    check("packaging_per_portion_positive", sql`${t.quantity} > 0`),
  ],
);

/**
 * Coût horaire moyen de main-d'œuvre par zone (cahier des charges §18.2), daté comme les autres coûts.
 * Saisi et historisé, mais **non imputé aux pertes** tant que la méthode d'affectation n'est pas définie.
 */
export const labourRates = pgTable(
  "labour_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    hourlyCostEur: numeric("hourly_cost_eur", { precision: 10, scale: 2, mode: "number" }).notNull(),
    /** Unité de référence du coût (par défaut : heure travaillée chargée). */
    unit: text("unit").notNull().default("heure"),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }),
    source: text("source"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("labour_rates_zone_valid_from_key").on(t.zoneId, t.validFrom),
    check("labour_rates_positive", sql`${t.hourlyCostEur} >= 0`),
    check("labour_rates_period", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
  ],
);
