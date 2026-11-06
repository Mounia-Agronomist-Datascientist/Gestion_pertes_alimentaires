import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { productionWeeks } from "./production-weeks";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Attribution d'une perte dans une sous-zone (voir docs/REGLES_METIER.md R6) :
 * - `equipe` : une équipe doit être sélectionnée (Cuisine / Production) ;
 * - `zone`   : la perte est attribuée à la zone et à son responsable, sans équipe.
 */
export const teamModeEnum = pgEnum("team_mode", ["equipe", "zone"]);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    letter: text("letter").notNull(),
    colorName: text("color_name").notNull(),
    colorHex: text("color_hex").notNull(),
    usualStart: time("usual_start"),
    usualEnd: time("usual_end"),
    managersLabel: text("managers_label"),
    displayOrder: smallint("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("teams_letter_key").on(t.letter),
    check("teams_color_hex_format", sql`${t.colorHex} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

/** Désactivation temporaire d'une équipe pour une semaine (absence de ligne = active). */
export const teamWeekStatus = pgTable(
  "team_week_status",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    productionWeekId: uuid("production_week_id")
      .notNull()
      .references(() => productionWeeks.id),
    active: boolean("active").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.teamId, t.productionWeekId] })],
);

export const zones = pgTable(
  "zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    displayOrder: smallint("display_order").notNull().default(0),
    requiresJustification: boolean("requires_justification").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("zones_code_key").on(t.code)],
);

export const subzones = pgTable(
  "subzones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    displayOrder: smallint("display_order").notNull().default(0),
    teamMode: teamModeEnum("team_mode").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("subzones_code_key").on(t.code)],
);
