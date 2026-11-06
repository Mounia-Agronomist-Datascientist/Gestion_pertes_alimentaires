import { sql } from "drizzle-orm";
import { check, date, pgTable, smallint, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/**
 * Calendrier des semaines de production (jeudi → mercredi), voir docs/REGLES_METIER.md R1.
 * Généré par `generateProductionCalendar`, corrigeable par l'administrateur.
 */
export const productionWeeks = pgTable(
  "production_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: smallint("year").notNull(),
    number: smallint("number").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("production_weeks_year_number_key").on(t.year, t.number),
    unique("production_weeks_start_date_key").on(t.startDate),
    check("production_weeks_seven_days", sql`${t.endDate} = ${t.startDate} + 6`),
    check("production_weeks_starts_thursday", sql`extract(isodow from ${t.startDate}) = 4`),
    check("production_weeks_number_range", sql`${t.number} between 1 and 53`),
  ],
);
