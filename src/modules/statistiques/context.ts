/** Période et filtres des statistiques lus dans l'adresse, validés (pages et exports). */
import type { Db } from "@/db/types";
import { parsePeriod, type Period } from "@/domain/periodes";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORIES } from "@/modules/declarations/input";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import type { StatsFilters } from "./facts";

const UUID = /^[0-9a-f-]{36}$/i;
export const isUuid = (v: string | undefined): v is string => !!v && UUID.test(v);

export type Params = Record<string, string | undefined>;

export interface StatsContext {
  today: string;
  period: Period;
  filters: StatsFilters;
  /** Filtres actifs, à reporter dans les liens. */
  filterParams: Record<string, string>;
  compareTeams: boolean;
}

/** Période (semaine en cours par défaut) et filtres lus dans l'adresse, validés. */
export async function statsContext(db: Db, user: AuthUser, params: Params): Promise<StatsContext> {
  const today = toProductionLocalDate(new Date());
  let period = parsePeriod(params);
  if (!period) {
    const week = await findStoredProductionWeek(db, today);
    period = week ? { kind: "semaine", year: week.year, number: week.number } : { kind: "mois", year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  }
  const compareTeams = can(user, "stats.compare_teams");
  const filters: StatsFilters = {
    zoneId: isUuid(params.zone) ? params.zone : undefined,
    teamId: compareTeams && isUuid(params.equipe) ? params.equipe : undefined,
    category: params.categorie && (PRODUCT_CATEGORIES as readonly string[]).includes(params.categorie) ? params.categorie : undefined,
  };
  const filterParams = Object.fromEntries(
    Object.entries({ zone: filters.zoneId, equipe: filters.teamId, categorie: filters.category }).filter((e): e is [string, string] => !!e[1]),
  );
  return { today, period, filters, filterParams, compareTeams };
}

/** Semaine des écrans « par semaine » (synthèse, évolution, ratios) : celle choisie, sinon la semaine en cours. */
export async function anchorWeek(db: Db, ctx: StatsContext): Promise<Extract<Period, { kind: "semaine" }> | null> {
  if (ctx.period.kind === "semaine") return ctx.period;
  const week = await findStoredProductionWeek(db, ctx.today);
  return week ? { kind: "semaine", year: week.year, number: week.number } : null;
}
