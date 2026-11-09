import { sql } from "drizzle-orm";
import { boolean, check, date, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { teams } from "./organisation";
import { productionWeeks } from "./production-weeks";

/**
 * Jours de production (docs/REGLES_METIER.md R8). Pré-remplis jeudi, vendredi, lundi, mardi, mercredi ;
 * ajustables (jours fériés, samedis travaillés) à partir du calendrier du portail.
 */
export const productionDays = pgTable("production_days", {
  day: date("day", { mode: "string" }).primaryKey(),
  productionWeekId: uuid("production_week_id")
    .notNull()
    .references(() => productionWeeks.id),
  isProductionDay: boolean("is_production_day").notNull().default(true),
  source: text("source").notNull().default("defaut"),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reuseWindowEnum = pgEnum("reuse_window", ["jeudi_vendredi", "lundi_mercredi"]);

/**
 * - `active` : au moins un jour de la plage sans déclaration, la perte estimée est comptée ;
 * - `regularisee` : tous les jours ont été renseignés depuis (dans le délai), l'estimation n'est plus comptée ;
 * - `annulee` : levée par un responsable, avec motif.
 */
export const alertStatusEnum = pgEnum("missing_declaration_status", ["active", "regularisee", "annulee"]);

/** Alerte « rien de noté » : au moins un jour d'une plage de réutilisation sans déclaration de l'équipe. */
export const missingDeclarationAlerts = pgTable(
  "missing_declaration_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    productionWeekId: uuid("production_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    window: reuseWindowEnum("window").notNull(),
    firstDay: date("first_day", { mode: "string" }).notNull(),
    lastDay: date("last_day", { mode: "string" }).notNull(),
    /** Jours de production de la plage sans déclaration (mis à jour jusqu'à régularisation). */
    missingDays: date("missing_days", { mode: "string" }).array().notNull().default(sql`'{}'::date[]`),
    /** Perte estimée (instantané de la valeur forfaitaire au moment de la détection). */
    estimatedKg: numeric("estimated_kg", { precision: 10, scale: 3, mode: "number" }).notNull(),
    status: alertStatusEnum("status").notNull().default("active"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    unique("missing_declaration_alerts_team_week_window_key").on(t.teamId, t.productionWeekId, t.window),
    check("missing_declaration_alerts_positive", sql`${t.estimatedKg} > 0`),
  ],
);
