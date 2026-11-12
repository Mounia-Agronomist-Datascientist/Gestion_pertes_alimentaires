import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { teams } from "./organisation";
import { productionWeeks } from "./production-weeks";

/**
 * Import hebdomadaire du plan de production et du tome Melba (docs/PHASE2.md).
 * Chaque import validé est un **instantané figé** de la semaine : un nouvel import de la même semaine crée une
 * nouvelle version et l'ancienne passe en « remplacée », sans rien effacer. Les pertes pointeront vers la
 * version en vigueur au moment de la saisie.
 */
export const weeklyImportStatusEnum = pgEnum("weekly_import_status", ["validee", "remplacee"]);

export const weeklyImports = pgTable(
  "weekly_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionWeekId: uuid("production_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    version: smallint("version").notNull(),
    status: weeklyImportStatusEnum("status").notNull().default("validee"),
    tomeFileName: text("tome_file_name").notNull(),
    planFileName: text("plan_file_name").notNull(),
    planSheetName: text("plan_sheet_name").notNull(),
    /** Anomalies affichées au moment de la validation (conservées telles quelles). */
    anomalies: jsonb("anomalies").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
  },
  (t) => [
    unique("weekly_imports_week_version_key").on(t.productionWeekId, t.version),
    // Une seule version en vigueur par semaine.
    uniqueIndex("weekly_imports_one_valid_per_week").on(t.productionWeekId).where(sql`${t.status} = 'validee'`),
  ],
);

export const planBlockEnum = pgEnum("plan_block", ["plats", "petits_dejeuners"]);

/** Plat d'une semaine : une formule (code permanent) et son contenu de la semaine. */
export const weekRecipes = pgTable(
  "week_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => weeklyImports.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Équipe d'après le plan de production ; null si le plan ne la donne pas (signalé à l'import). */
    teamId: uuid("team_id").references(() => teams.id),
    /** Groupe de codes produits ensemble par l'équipe (« VI02/VI08/QD02/QD08 »). */
    planGroup: text("plan_group"),
    planBlock: planBlockEnum("plan_block"),
    weekBarquettes: integer("week_barquettes"),
    firstDayBarquettes: integer("first_day_barquettes"),
    portionWeightG: numeric("portion_weight_g", { precision: 10, scale: 3, mode: "number" }),
    /** « Recette totale » du tome, pour une portion. */
    totalWeightG: numeric("total_weight_g", { precision: 12, scale: 3, mode: "number" }),
    totalCostEur: numeric("total_cost_eur", { precision: 10, scale: 4, mode: "number" }),
  },
  (t) => [unique("week_recipes_import_code_key").on(t.importId, t.code), index("week_recipes_team_idx").on(t.importId, t.teamId)],
);

/** Sous-recette d'une semaine, identifiée par son nom normalisé (pas de code Melba). */
export const weekSubRecipes = pgTable(
  "week_sub_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => weeklyImports.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    referenceQuantity: numeric("reference_quantity", { precision: 12, scale: 3, mode: "number" }),
    referenceUnit: text("reference_unit"),
    /** « Recette totale » : poids brut des ingrédients pour la quantité de référence. */
    grossQuantity: numeric("gross_quantity", { precision: 12, scale: 3, mode: "number" }),
    grossUnit: text("gross_unit"),
    /** « Poids net » : après cuisson ou préparation. */
    netQuantity: numeric("net_quantity", { precision: 12, scale: 3, mode: "number" }),
    netUnit: text("net_unit"),
    totalCostEur: numeric("total_cost_eur", { precision: 10, scale: 4, mode: "number" }),
  },
  (t) => [unique("week_sub_recipes_import_key_key").on(t.importId, t.key)],
);

/**
 * Ligne de composition : un composant d'un plat ou d'une sous-recette (sous-recette ou ingrédient),
 * avec quantité, unité, poids unitaire et coût tels qu'imprimés dans le tome.
 */
export const weekRecipeLines = pgTable(
  "week_recipe_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => weeklyImports.id),
    recipeId: uuid("recipe_id").references(() => weekRecipes.id),
    subRecipeId: uuid("sub_recipe_id").references(() => weekSubRecipes.id),
    position: smallint("position").notNull(),
    label: text("label").notNull(),
    key: text("key").notNull(),
    isSubRecipe: boolean("is_sub_recipe").notNull(),
    /** Sous-recette détaillée correspondant à cette ligne (quand c'en est une). */
    componentSubRecipeId: uuid("component_sub_recipe_id").references(() => weekSubRecipes.id),
    quantity: numeric("quantity", { precision: 12, scale: 4, mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    unitWeightG: numeric("unit_weight_g", { precision: 12, scale: 3, mode: "number" }),
    costEur: numeric("cost_eur", { precision: 10, scale: 4, mode: "number" }),
  },
  (t) => [
    check("week_recipe_lines_one_owner", sql`(${t.recipeId} is null) <> (${t.subRecipeId} is null)`),
    index("week_recipe_lines_recipe_idx").on(t.recipeId),
    index("week_recipe_lines_sub_recipe_idx").on(t.subRecipeId),
  ],
);

/**
 * Barquettes réellement produites d'une semaine, lues dans le « Décompte barquettes » (onglet « Semaine NN »,
 * colonne « Ma production »), docs/PHASE4.md étape 4.6. Même principe que l'import de la semaine : instantané
 * figé, nouvelle lecture = nouvelle version, l'ancienne passe en « remplacée ».
 */
export const productionCounts = pgTable(
  "production_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionWeekId: uuid("production_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    version: smallint("version").notNull(),
    status: weeklyImportStatusEnum("status").notNull().default("validee"),
    fileName: text("file_name").notNull(),
    sheetName: text("sheet_name").notNull(),
    anomalies: jsonb("anomalies").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
  },
  (t) => [
    unique("production_counts_week_version_key").on(t.productionWeekId, t.version),
    uniqueIndex("production_counts_one_valid_per_week").on(t.productionWeekId).where(sql`${t.status} = 'validee'`),
  ],
);

export const productionCountLines = pgTable(
  "production_count_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countId: uuid("count_id")
      .notNull()
      .references(() => productionCounts.id),
    code: text("code").notNull(),
    madeBarquettes: integer("made_barquettes").notNull(),
  },
  (t) => [unique("production_count_lines_count_code_key").on(t.countId, t.code), check("production_count_lines_positive", sql`${t.madeBarquettes} >= 0`)],
);
