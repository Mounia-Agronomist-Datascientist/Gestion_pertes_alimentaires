import { sql } from "drizzle-orm";
import { boolean, check, date, jsonb, numeric, pgEnum, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Facteurs d'émission (docs/PHASE5.md, étape 5.4 ; cahier des charges §20.2). Chaque ingrédient Melba sera
 * rattaché à une famille alimentaire (étape 5.5) ; le facteur d'une famille vient d'Agribalyse (ADEME) et n'est
 * utilisé qu'une fois **validé**. Les anciennes versions sont conservées (décision du 12/11/2026) : un calcul fait
 * avec une version n'est jamais réécrit.
 */
export const foodFamilies = pgTable(
  "food_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Regroupement d'affichage (viandes, poissons, légumes…). */
    category: text("category").notNull(),
    displayOrder: smallint("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("food_families_code_key").on(t.code)],
);

export const emissionFactorStatusEnum = pgEnum("emission_factor_status", ["propose", "valide", "remplace", "refuse"]);

export interface FactorStages {
  agriculture: number;
  transformation: number;
  emballage: number;
  transport: number;
  distribution: number;
  consommation: number;
}

export const emissionFactors = pgTable(
  "emission_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => foodFamilies.id),
    version: smallint("version").notNull(),
    status: emissionFactorStatusEnum("status").notNull().default("propose"),
    /** kg CO2e par kg de produit. */
    kgCo2ePerKg: numeric("kg_co2e_per_kg", { precision: 10, scale: 4, mode: "number" }).notNull(),
    source: text("source").notNull(),
    sourceVersion: text("source_version"),
    /** Date de référence des données de la source. */
    referenceDate: date("reference_date", { mode: "string" }),
    /** Produit de la source retenu pour la famille (code AGB, nom). */
    referenceCode: text("reference_code"),
    referenceName: text("reference_name"),
    /** Valeurs par étape du cycle de vie (kg CO2e / kg), quand la source les donne. */
    stages: jsonb("stages").$type<FactorStages>(),
    hypotheses: text("hypotheses").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    validatedBy: uuid("validated_by").references(() => users.id),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    /** Remplacé par une version plus récente validée (ou proposition refusée). */
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique("emission_factors_family_version_key").on(t.familyId, t.version),
    uniqueIndex("emission_factors_one_valid_per_family").on(t.familyId).where(sql`${t.status} = 'valide'`),
    uniqueIndex("emission_factors_one_proposal_per_family").on(t.familyId).where(sql`${t.status} = 'propose'`),
    check("emission_factors_positive", sql`${t.kgCo2ePerKg} >= 0`),
  ],
);

export const ingredientMappingStatusEnum = pgEnum("ingredient_mapping_status", ["famille", "non_couvert", "non_alimentaire"]);

/**
 * Rattachement d'un ingrédient du tome Melba (libellé normalisé, `tomeKey`) à une famille alimentaire (étape
 * 5.5), validé par l'administration. « Non couvert » : aliment sans famille (épices, fonds…), compté à part dans
 * le CO2e ; « non alimentaire » : contenant ou ustensile listé dans une recette, jamais compté.
 */
export const ingredientFamilies = pgTable(
  "ingredient_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ingredientKey: text("ingredient_key").notNull(),
    /** Libellé tel qu'il apparaît dans le tome (exemple). */
    label: text("label").notNull(),
    status: ingredientMappingStatusEnum("status").notNull(),
    familyId: uuid("family_id").references(() => foodFamilies.id),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ingredient_families_key").on(t.ingredientKey),
    check("ingredient_families_family_iff_status", sql`(${t.status} = 'famille') = (${t.familyId} is not null)`),
  ],
);
