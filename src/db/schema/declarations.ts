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
import { weeklyImports, weekRecipeLines, weekRecipes, weekSubRecipes } from "./imports";
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
    /**
     * Produit choisi dans l'import de la semaine (docs/PHASE2.md, étape 2.5) : un plat, une sous-recette ou un
     * ingrédient (ligne de composition). Au plus une des trois références ; le nom et le type restent copiés
     * ci-dessus comme pour tout produit.
     */
    weekRecipeId: uuid("week_recipe_id").references(() => weekRecipes.id),
    weekSubRecipeId: uuid("week_sub_recipe_id").references(() => weekSubRecipes.id),
    weekLineId: uuid("week_line_id").references(() => weekRecipeLines.id),

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

    /**
     * Coût matière figé à la saisie (docs/PHASE2.md, étape 2.6) : coûts du tome Melba de la semaine pour un
     * produit de la semaine ; vides pour un produit du référentiel ou hors liste (pas de coût connu).
     */
    costPerKgEur: numeric("cost_per_kg_eur", { precision: 12, scale: 4, mode: "number" }),
    costPerUnitEur: numeric("cost_per_unit_eur", { precision: 12, scale: 4, mode: "number" }),
    /** Coût matières estimé de la perte, hors moules et plats à gratin (poids net × coût au kg, ou nombre × coût unitaire). */
    materialCostEur: numeric("material_cost_eur", { precision: 12, scale: 4, mode: "number" }),
    /** Import (tome) d'où viennent les coûts. */
    costImportId: uuid("cost_import_id").references(() => weeklyImports.id),
    /** Instantané du coût brut par composante (cahier des charges §18.5, docs/PHASE3.md étape 3.4). */
    packagingCostEur: numeric("packaging_cost_eur", { precision: 12, scale: 4, mode: "number" }),
    labourCostEur: numeric("labour_cost_eur", { precision: 12, scale: 4, mode: "number" }),
    indirectCostEur: numeric("indirect_cost_eur", { precision: 12, scale: 4, mode: "number" }),
    grossCostEur: numeric("gross_cost_eur", { precision: 12, scale: 4, mode: "number" }),
    /** Recettes encaissées (ventes Too Good To Go, vente flash…), somme des lignes de destination (§10.4). */
    recoveredEur: numeric("recovered_eur", { precision: 12, scale: 2, mode: "number" }),
    /** Coût net = coût brut − recettes encaissées ; brut et net restent consultables séparément (§18.6). */
    netCostEur: numeric("net_cost_eur", { precision: 12, scale: 4, mode: "number" }),
    costMethod: text("cost_method"),
    costComputedAt: timestamp("cost_computed_at", { withTimezone: true }),
    /** Détail utilisé : version de l'import, emballages et coûts unitaires appliqués, portions. */
    costDetails: jsonb("cost_details"),

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
      sql`(${t.productId} is not null) or ${t.productUnlisted} or (${t.weekRecipeId} is not null) or (${t.weekSubRecipeId} is not null) or (${t.weekLineId} is not null)`,
    ),
    check(
      "loss_declarations_one_week_item",
      sql`num_nonnulls(${t.weekRecipeId}, ${t.weekSubRecipeId}, ${t.weekLineId}) <= 1`,
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
  /** Montant réellement encaissé pour cette ligne (destinations « vente » uniquement), saisi ou complété plus tard. */
  recoveredAmount: numeric("recovered_amount", { precision: 12, scale: 2, mode: "number" }),
  /** N° de la poubelle où la perte est jetée (destinations qui le demandent : Les Alchimistes). */
  binNumber: text("bin_number"),
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
