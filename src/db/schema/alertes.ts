import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
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
    missingDays: date("missing_days", { mode: "string" })
      .array()
      .notNull()
      .default(sql`'{}'::date[]`),
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

// ─── Alertes d'analyse (docs/PHASE6.md, étapes 6.2 à 6.4) ────────────────────

/** Seuils des alertes d'analyse et des tendances : une seule ligne, réglable dans l'administration (étape 6.4). */
export const alertSettings = pgTable(
  "alert_settings",
  {
    id: smallint("id").primaryKey().default(1),
    /** Dépassement de la moyenne des 4 semaines précédentes (0,5 = +50 %). */
    unusualRate: numeric("unusual_rate", { precision: 5, scale: 3, mode: "number" }).notNull().default(0.5),
    /** Kg de pertes de la semaine sous lesquels aucune alerte n'est émise. */
    minKg: numeric("min_kg", { precision: 8, scale: 3, mode: "number" }).notNull().default(5),
    /** Semaines de suite où la même cause est en tête. */
    recurrenceWeeks: smallint("recurrence_weeks").notNull().default(3),
    /** Écart sous lequel une tendance est stable. */
    trendStableRate: numeric("trend_stable_rate", { precision: 5, scale: 3, mode: "number" }).notNull().default(0.1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [
    check("alert_settings_single_row", sql`${t.id} = 1`),
    check(
      "alert_settings_values",
      sql`${t.unusualRate} > 0 and ${t.minKg} >= 0 and ${t.recurrenceWeeks} >= 2 and ${t.trendStableRate} >= 0`,
    ),
  ],
);

export const lossAlertKindEnum = pgEnum("loss_alert_kind", ["perte_inhabituelle", "cause_recurrente"]);
export const lossAlertScopeEnum = pgEnum("loss_alert_scope", ["equipe", "zone", "plat"]);

/**
 * Alerte d'analyse d'une semaine de production terminée : perte inhabituelle (6.2) ou cause récurrente (6.3).
 * Calculée par la tâche de nuit ; recalculée tant que la semaine est dans la période revue (une correction peut
 * la faire disparaître tant qu'elle n'a pas été vue).
 */
export const lossAlerts = pgTable(
  "loss_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: lossAlertKindEnum("kind").notNull(),
    productionWeekId: uuid("production_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    scope: lossAlertScopeEnum("scope").notNull(),
    /** Équipe, zone (id) ou code du plat. */
    subjectKey: text("subject_key").notNull(),
    /** Équipe concernée (alerte d'équipe, ou équipe du plat d'après le plan) : elle voit l'alerte. */
    teamId: uuid("team_id").references(() => teams.id),
    label: text("label").notNull(),
    /** Perte inhabituelle : « kg_1000 » ou « kg », valeur de la semaine, moyenne de référence, dépassement. */
    measure: text("measure"),
    value: numeric("value", { precision: 12, scale: 3, mode: "number" }),
    reference: numeric("reference", { precision: 12, scale: 3, mode: "number" }),
    rate: numeric("rate", { precision: 8, scale: 3, mode: "number" }),
    referenceWeeks: smallint("reference_weeks"),
    /** Contexte affiché (causes et produits principaux, ou cause récurrente et ses semaines). */
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    seenBy: uuid("seen_by").references(() => users.id),
  },
  (t) => [
    unique("loss_alerts_subject_key").on(t.kind, t.productionWeekId, t.scope, t.subjectKey),
    index("loss_alerts_week_idx").on(t.productionWeekId),
    index("loss_alerts_team_idx").on(t.teamId),
  ],
);

/**
 * « Vu » d'une alerte d'analyse, par compte : chacun retire l'alerte de son accueil. La première lecture marque
 * aussi l'alerte (`loss_alerts.seen_at`) : elle reste alors dans l'historique même si une correction la dément.
 */
export const lossAlertViews = pgTable(
  "loss_alert_views",
  {
    alertId: uuid("alert_id")
      .notNull()
      .references(() => lossAlerts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.userId] })],
);
