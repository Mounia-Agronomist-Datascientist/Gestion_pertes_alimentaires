import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { subzones, zones } from "./organisation";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ─── Unités ──────────────────────────────────────────────────────────────────

export const unitKindEnum = pgEnum("unit_kind", ["masse", "volume", "comptage"]);

/**
 * `to_base_factor` convertit vers l'unité de base de la famille :
 * kg pour la masse, L pour le volume, 1 pour le comptage.
 */
export const units = pgTable(
  "units",
  {
    code: text("code").primaryKey(),
    label: text("label").notNull(),
    kind: unitKindEnum("kind").notNull(),
    toBaseFactor: numeric("to_base_factor", { precision: 12, scale: 6, mode: "number" }).notNull(),
    displayOrder: smallint("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [check("units_factor_positive", sql`${t.toBaseFactor} > 0`)],
);

// ─── Produits (référentiel simple de Phase 1, enrichi par les imports en Phase 2) ──

export const productCategoryEnum = pgEnum("product_category", [
  "matiere_premiere",
  "sous_recette",
  "recette",
  "produit_fini",
  "produit_externe",
  "consommable",
  // Moules et plats à gratin listés comme ingrédients dans le tome Melba (décision du 10/11/2026).
  "moule_plat_gratin",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: productCategoryEnum("category").notNull(),
    externalId: text("external_id"),
    code: text("code"),
    name: text("name").notNull(),
    variant: text("variant"),
    defaultUnit: text("default_unit")
      .notNull()
      .references(() => units.code),
    // Jamais inventés : null tant que la valeur n'est pas connue (docs/REGLES_METIER.md R2).
    unitWeightKg: numeric("unit_weight_kg", { precision: 12, scale: 4, mode: "number" }),
    densityKgPerL: numeric("density_kg_per_l", { precision: 8, scale: 4, mode: "number" }),
    source: text("source").notNull().default("manuel"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_external_id_key").on(t.externalId).where(sql`${t.externalId} is not null`),
    uniqueIndex("products_category_code_key").on(t.category, t.code).where(sql`${t.code} is not null`),
    check("products_unit_weight_positive", sql`${t.unitWeightKg} is null or ${t.unitWeightKg} > 0`),
    check("products_density_positive", sql`${t.densityKgPerL} is null or ${t.densityKgPerL} > 0`),
  ],
);

// ─── Causes ──────────────────────────────────────────────────────────────────

export const causeStatusEnum = pgEnum("cause_status", ["proposee", "active", "rejetee", "inactive"]);

export const causes = pgTable(
  "causes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    name: text("name").notNull(),
    description: text("description"),
    /** Cause « Autres pertes » : proposée dans toutes les zones. */
    isOther: boolean("is_other").notNull().default(false),
    status: causeStatusEnum("status").notNull().default("active"),
    displayOrder: smallint("display_order").notNull().default(0),
    proposedBy: uuid("proposed_by").references(() => users.id),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("causes_code_key").on(t.code).where(sql`${t.code} is not null`)],
);

export const causeZones = pgTable(
  "cause_zones",
  {
    causeId: uuid("cause_id")
      .notNull()
      .references(() => causes.id),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
  },
  (t) => [primaryKey({ columns: [t.causeId, t.zoneId] })],
);

/**
 * Restriction facultative d'une cause à certaines sous-zones (ex. « Chutes de découpe » au déboîtage).
 * Sans ligne ici, la cause est proposée dans toutes les sous-zones de ses zones.
 */
export const causeSubzones = pgTable(
  "cause_subzones",
  {
    causeId: uuid("cause_id")
      .notNull()
      .references(() => causes.id),
    subzoneId: uuid("subzone_id")
      .notNull()
      .references(() => subzones.id),
  },
  (t) => [primaryKey({ columns: [t.causeId, t.subzoneId] })],
);

// ─── Destinations ────────────────────────────────────────────────────────────

export const destinationKindEnum = pgEnum("destination_kind", [
  "destruction",
  "compost",
  "don",
  "personnel",
  "vente",
  "reutilisation",
  "retour_fournisseur",
  "autre",
]);

/** N° de poubelle à noter à chaque perte (Les Alchimistes) : non demandé, facultatif ou obligatoire. */
export const binNumberModeEnum = pgEnum("bin_number_mode", ["aucun", "facultatif", "obligatoire"]);

export const destinations = pgTable(
  "destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: destinationKindEnum("kind").notNull(),
    /** Seules ces destinations peuvent porter une recette récupérée (§10.4). */
    financialRecovery: boolean("financial_recovery").notNull().default(false),
    /**
     * N° de poubelle à noter à chaque perte, pour le rapprochement des collectes des Alchimistes (décisions du 12/11/2026) :
     * facultatif tant que leur fichier ne donne pas les n° des bacs collectés, obligatoire ensuite.
     */
    binNumberMode: binNumberModeEnum("bin_number_mode").notNull().default("aucun"),
    displayOrder: smallint("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("destinations_code_key").on(t.code),
    check(
      "destinations_recovery_only_for_sales",
      sql`not ${t.financialRecovery} or ${t.kind} = 'vente'`,
    ),
  ],
);

// ─── Contenants et tares (docs/REGLES_METIER.md R3) ──────────────────────────

/**
 * `gastro` : bac posé sur l'échelle, en nombre variable (`max_count` = capacité de l'échelle) ;
 * `support` : échelle ou chariot pesé avec les bacs, au plus un par pesée.
 */
export const containerKindEnum = pgEnum("container_kind", ["gastro", "support"]);

export const containerTypes = pgTable(
  "container_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: containerKindEnum("kind").notNull(),
    maxCount: smallint("max_count"),
    displayOrder: smallint("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("container_types_code_key").on(t.code),
    check("container_types_max_count_positive", sql`${t.maxCount} is null or ${t.maxCount} > 0`),
  ],
);

/** Tare unitaire versionnée : une modification crée une nouvelle ligne et clôture l'ancienne. */
export const containerTares = pgTable(
  "container_tares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    containerTypeId: uuid("container_type_id")
      .notNull()
      .references(() => containerTypes.id),
    unitTareKg: numeric("unit_tare_kg", { precision: 8, scale: 3, mode: "number" }).notNull(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }),
    source: text("source"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("container_tares_type_valid_from_key").on(t.containerTypeId, t.validFrom),
    check("container_tares_positive", sql`${t.unitTareKg} > 0`),
    check("container_tares_period", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
  ],
);
