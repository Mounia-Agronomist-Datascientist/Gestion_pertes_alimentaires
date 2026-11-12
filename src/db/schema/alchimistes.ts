import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { productionWeeks } from "./production-weeks";

/**
 * Pesées des Alchimistes (docs/PHASE5.md, étape 5.2) : une mesure de contrôle, **jamais ajoutée aux pertes
 * déclarées** (§21). Chaque dépôt de fichier est conservé. Un nouveau fichier remplace les collectes déjà
 * enregistrées sur sa période (une même date peut avoir plusieurs bacs de même poids : impossible de reconnaître
 * une ligne déjà importée) ; les collectes remplacées restent en base, marquées par le dépôt qui les remplace.
 * Le nom du client et de l'établissement ne sont pas enregistrés.
 */
export const alchimistesImports = pgTable(
  "alchimistes_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileName: text("file_name").notNull(),
    /** Période couverte par le fichier (première et dernière date, livraisons comprises). */
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    periodTo: date("period_to", { mode: "string" }).notNull(),
    collections: integer("collections").notNull(),
    totalKg: numeric("total_kg", { precision: 12, scale: 3, mode: "number" }).notNull(),
    /** Livraisons de bacs vides ignorées. */
    deliveries: integer("deliveries").notNull().default(0),
    anomalies: jsonb("anomalies").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("alchimistes_imports_period", sql`${t.periodTo} >= ${t.periodFrom}`)],
);

export const alchimistesCollections = pgTable(
  "alchimistes_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => alchimistesImports.id),
    collectedOn: date("collected_on", { mode: "string" }).notNull(),
    /** Semaine de production de la date de collecte (calendrier de l'application). */
    productionWeekId: uuid("production_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    containerType: text("container_type"),
    /** N° du bac, quand le fichier le donne (demandé aux Alchimistes). */
    containerNumber: text("container_number"),
    netKg: numeric("net_kg", { precision: 10, scale: 3, mode: "number" }).notNull(),
    quality: smallint("quality"),
    incident: text("incident"),
    material: text("material"),
    /** Semaine écrite dans le fichier (« S19 »), gardée pour contrôle. */
    fileWeek: text("file_week"),
    /** Dépôt plus récent qui a remplacé cette collecte ; null : en vigueur. */
    replacedByImportId: uuid("replaced_by_import_id").references(() => alchimistesImports.id),
  },
  (t) => [
    index("alchimistes_collections_week_idx").on(t.productionWeekId),
    index("alchimistes_collections_date_idx").on(t.collectedOn),
    check("alchimistes_collections_weight", sql`${t.netKg} >= 0`),
  ],
);
