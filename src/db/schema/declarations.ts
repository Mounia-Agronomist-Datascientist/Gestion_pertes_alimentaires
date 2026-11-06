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
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { subzones, teams, zones } from "./organisation";
import { productionWeeks } from "./production-weeks";
import { causes, containerTares, destinations, productCategoryEnum, products, units } from "./referentiels";

export const declarationStatusEnum = pgEnum("declaration_status", ["brouillon", "validee", "corrigee", "annulee"]);
export const responsibilityEnum = pgEnum("responsibility", ["equipe", "zone"]);
export const measurementMethodEnum = pgEnum("measurement_method", [
  "pesee",
  "estimation_contenant",
  "comptage",
  "conversion_reference",
  "estimation_manuelle",
]);
export const kgStatusEnum = pgEnum("kg_status", ["pese", "converti", "non_converti", "sans_objet"]);

/** Lot de saisie du mode groupé (docs/ECRANS_PHASE1.md E4). */
export const declarationBatches = pgTable("declaration_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  defaults: jsonb("defaults"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

/**
 * Déclaration de perte. Les colonnes « instantané » recopient les données de référence
 * au moment de la saisie : elles ne sont jamais recalculées (docs/REGLES_METIER.md R5).
 */
export const lossDeclarations = pgTable(
  "loss_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: declarationStatusEnum("status").notNull(),
    revision: integer("revision").notNull().default(1),

    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    occurredTime: time("occurred_time"),
    declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
    productionWeekId: uuid("production_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    declaredWeekId: uuid("declared_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    isLate: boolean("is_late").notNull(),

    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    subzoneId: uuid("subzone_id")
      .notNull()
      .references(() => subzones.id),
    teamId: uuid("team_id").references(() => teams.id),
    responsibility: responsibilityEnum("responsibility").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    batchId: uuid("batch_id").references(() => declarationBatches.id),

    productId: uuid("product_id").references(() => products.id),
    /** Produit saisi en texte libre, absent du référentiel : à revoir par l'administrateur. */
    productUnlisted: boolean("product_unlisted").notNull().default(false),
    productCategory: productCategoryEnum("product_category").notNull(),
    productName: text("product_name").notNull(),
    productExternalId: text("product_external_id"),
    productCode: text("product_code"),
    productVariant: text("product_variant"),

    measurementMethod: measurementMethodEnum("measurement_method").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 4, mode: "number" }).notNull(),
    unitCode: text("unit_code")
      .notNull()
      .references(() => units.code),
    tareTotalKg: numeric("tare_total_kg", { precision: 12, scale: 4, mode: "number" }),
    netQuantity: numeric("net_quantity", { precision: 12, scale: 4, mode: "number" }).notNull(),
    netUnitCode: text("net_unit_code")
      .notNull()
      .references(() => units.code),
    netKg: numeric("net_kg", { precision: 12, scale: 4, mode: "number" }),
    kgStatus: kgStatusEnum("kg_status").notNull(),
    conversionFactorUsed: numeric("conversion_factor_used", { precision: 12, scale: 4, mode: "number" }),

    causeId: uuid("cause_id")
      .notNull()
      .references(() => causes.id),
    causeName: text("cause_name").notNull(),
    comment: text("comment"),
    destinationGapJustification: text("destination_gap_justification"),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loss_declarations_week_team_idx").on(t.productionWeekId, t.teamId),
    index("loss_declarations_zone_week_idx").on(t.zoneId, t.productionWeekId),
    index("loss_declarations_cause_idx").on(t.causeId),
    index("loss_declarations_product_idx").on(t.productId),
    index("loss_declarations_created_by_idx").on(t.createdBy),
    check("loss_declarations_quantity_positive", sql`${t.quantity} > 0 and ${t.netQuantity} > 0`),
    check(
      "loss_declarations_team_matches_responsibility",
      sql`(${t.responsibility} = 'equipe') = (${t.teamId} is not null)`,
    ),
    check(
      "loss_declarations_product_reference",
      sql`(${t.productId} is not null) or ${t.productUnlisted}`,
    ),
  ],
);

/**
 * Tares utilisées pour une pesée en gastros (version de tare conservée).
 * `revision` : version de la déclaration à laquelle la ligne appartient ; les lignes des versions
 * précédentes sont conservées.
 */
export const declarationContainers = pgTable("declaration_containers", {
  id: uuid("id").primaryKey().defaultRandom(),
  declarationId: uuid("declaration_id")
    .notNull()
    .references(() => lossDeclarations.id),
  revision: integer("revision").notNull().default(1),
  containerTareId: uuid("container_tare_id")
    .notNull()
    .references(() => containerTares.id),
  count: smallint("count").notNull(),
  tareKgSnapshot: numeric("tare_kg_snapshot", { precision: 12, scale: 4, mode: "number" }).notNull(),
});

/** Répartition de la perte entre destinations, dans l'unité de la quantité nette (versionnée comme ci-dessus). */
export const declarationDestinations = pgTable("declaration_destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  declarationId: uuid("declaration_id")
    .notNull()
    .references(() => lossDeclarations.id),
  revision: integer("revision").notNull().default(1),
  destinationId: uuid("destination_id")
    .notNull()
    .references(() => destinations.id),
  quantity: numeric("quantity", { precision: 12, scale: 4, mode: "number" }).notNull(),
  netKg: numeric("net_kg", { precision: 12, scale: 4, mode: "number" }),
  recoveredAmount: numeric("recovered_amount", { precision: 12, scale: 2, mode: "number" }),
});

/**
 * Historique complet : une ligne par version d'une déclaration, en insertion seule
 * (docs/REGLES_METIER.md R5).
 */
export const declarationRevisions = pgTable(
  "declaration_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    declarationId: uuid("declaration_id")
      .notNull()
      .references(() => lossDeclarations.id),
    revision: integer("revision").notNull(),
    status: declarationStatusEnum("status").notNull(),
    data: jsonb("data").notNull(),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
  },
  (t) => [unique("declaration_revisions_declaration_revision_key").on(t.declarationId, t.revision)],
);
