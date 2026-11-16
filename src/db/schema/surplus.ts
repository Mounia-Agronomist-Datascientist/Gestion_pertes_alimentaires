import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { weekRecipes } from "./imports";
import { productionWeeks } from "./production-weeks";

/**
 * Ventes et dons des surplus de barquettes (docs/PHASE5.md, étape 5.8) : les fichiers de l'entreprise font foi
 * (décision du 13/11/2026). Trois sources :
 * - « VENTES TGTG » : ventes Too Good To Go (barquettes, prix payé par les clients) et versements reçus (HT, après
 *   commission) ;
 * - « VENTES FLASH » : ventes de boxes aux clients en pause (chiffre d'affaires TTC) ;
 * - « Gestion des surplus barquettes pour association Linkee » : dons, plat par plat.
 * Chaque dépôt est conservé. Un nouveau fichier d'une source remplace les lignes en vigueur de cette source sur sa
 * période ; elles restent en base, marquées par le dépôt qui les remplace. Les contacts du fichier Linkee ne sont
 * jamais lus.
 */
export const surplusSourceEnum = pgEnum("surplus_source", ["tgtg", "vente_flash", "linkee"]);
/** Vente (TGTG, vente flash), versement reçu de Too Good To Go, don à Linkee. */
export const surplusEntryKindEnum = pgEnum("surplus_entry_kind", ["vente", "versement", "don"]);

export const surplusImports = pgTable(
  "surplus_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: surplusSourceEnum("source").notNull(),
    fileName: text("file_name").notNull(),
    /** Onglets lus (« TGTG2025, TGTG2026 »). */
    sheets: text("sheets").notNull(),
    periodFrom: date("period_from", { mode: "string" }).notNull(),
    periodTo: date("period_to", { mode: "string" }).notNull(),
    entries: integer("entries").notNull(),
    anomalies: jsonb("anomalies").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("surplus_imports_period", sql`${t.periodTo} >= ${t.periodFrom}`)],
);

export const surplusEntries = pgTable(
  "surplus_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => surplusImports.id),
    source: surplusSourceEnum("source").notNull(),
    kind: surplusEntryKindEnum("kind").notNull(),
    /** Date de vente, de versement ou de collecte. */
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    /** Semaine de production de la date ; null hors du calendrier de l'application. */
    productionWeekId: uuid("production_week_id").references(() => productionWeeks.id),
    /** Barquettes de plats vendues ou données. */
    trays: integer("trays").notNull().default(0),
    /** Barquettes de petit-déjeuner vendues (boxes de vente flash avec petits-déjeuners). */
    breakfastTrays: integer("breakfast_trays").notNull().default(0),
    /** Too Good To Go : barquettes proposées. */
    offeredTrays: integer("offered_trays"),
    /** Vente flash : boxes vendues, dont boxes avec petits-déjeuners. */
    boxes: integer("boxes"),
    breakfastBoxes: integer("breakfast_boxes"),
    formula: text("formula"),
    /**
     * Montant : prix payé par les clients pour une vente TGTG, chiffre d'affaires TTC pour une vente flash,
     * montant reçu HT après commission pour un versement TGTG ; null pour un don ou un montant absent.
     */
    amountEur: numeric("amount_eur", { precision: 12, scale: 2, mode: "number" }),
    /** Vente flash : code de la vente (« VF300126 »). */
    code: text("code"),
    note: text("note"),
    /** Linkee : plat donné, n° de lot, code plat lu dans le lot, date de production, DLC, collecte faite. */
    dishName: text("dish_name"),
    lot: text("lot"),
    dishCode: text("dish_code"),
    producedOn: date("produced_on", { mode: "string" }),
    bestBefore: date("best_before", { mode: "string" }),
    collected: boolean("collected"),
    /** Plat Melba retrouvé (import en vigueur de la semaine de production) : poids et coût figés au dépôt. */
    weekRecipeId: uuid("week_recipe_id").references(() => weekRecipes.id),
    netKg: numeric("net_kg", { precision: 12, scale: 3, mode: "number" }),
    /** Coût matières Melba : barquettes × coût d'une portion. */
    costEur: numeric("cost_eur", { precision: 12, scale: 2, mode: "number" }),
    /** Dépôt plus récent qui a remplacé cette ligne ; null : en vigueur. */
    replacedByImportId: uuid("replaced_by_import_id").references(() => surplusImports.id),
  },
  (t) => [
    index("surplus_entries_source_date_idx").on(t.source, t.occurredOn),
    index("surplus_entries_week_idx").on(t.productionWeekId),
    check("surplus_entries_quantities", sql`${t.trays} >= 0 and ${t.breakfastTrays} >= 0`),
  ],
);
