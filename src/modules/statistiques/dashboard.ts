/**
 * Tableau de bord général (docs/PHASE4.md, étape 4.2 ; cahier des charges §19.1) : agrégats de la période
 * choisie et de la période précédente (évolution), avec les filtres.
 */
import { asc } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { Period } from "@/domain/periodes";
import { summarize } from "@/domain/statistiques";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { adjacentOf, loadFacts, type StatsFilters } from "./facts";

/** Types de destination du tableau de bord, dans l'ordre du cahier des charges (§19.1), puis les autres. */
export const DESTINATION_KIND_STATS = [
  { kind: "destruction", label: "Détruite" },
  { kind: "compost", label: "Compostée" },
  { kind: "don", label: "Donnée" },
  { kind: "vente", label: "Vendue" },
  { kind: "reutilisation", label: "Réutilisée" },
  { kind: "personnel", label: "Repas du personnel" },
  { kind: "retour_fournisseur", label: "Retour fournisseur" },
  { kind: "autre", label: "Autre" },
] as const;

export async function generalDashboard(db: Db, user: AuthUser, period: Period, filters: StatsFilters) {
  const withCosts = can(user, "indicators.read");
  const [facts, previous, next] = await Promise.all([loadFacts(db, user, period, filters), adjacentOf(db, period, -1), adjacentOf(db, period, 1)]);
  const previousFacts = previous ? await loadFacts(db, user, previous, filters) : null;
  return {
    withCosts,
    current: summarize(facts, withCosts),
    previous: previousFacts ? summarize(previousFacts, withCosts) : null,
    previousPeriod: previous,
    nextPeriod: next,
  };
}

/** Choix proposés dans la barre de filtres. */
export async function dashboardFilterOptions(db: Db) {
  const [zones, teams] = await Promise.all([
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones).orderBy(asc(s.zones.displayOrder)),
    db.select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName }).from(s.teams).orderBy(asc(s.teams.displayOrder)),
  ]);
  return { zones, teams };
}
