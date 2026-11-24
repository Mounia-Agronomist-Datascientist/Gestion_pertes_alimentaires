/**
 * Tableau de bord général (docs/PHASE4.md, étape 4.2 ; cahier des charges §19.1) : agrégats de la période
 * choisie et de la période précédente (évolution), avec les filtres.
 */
import { asc } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { Period } from "@/domain/periodes";
import { causeLenses, summarize } from "@/domain/statistiques";
import { type AuthUser, can } from "@/modules/auth/permissions";
import type { StatsSummary } from "@/domain/statistiques";
import { zoneNameWithoutNumber } from "@/domain/nom-zone";
import { adjacentOf, loadFacts, type StatsFilters } from "./facts";
import { zoneFlowTiles } from "./flux-zones";

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
  const [facts, returns, previous, next] = await Promise.all([
    loadFacts(db, user, period, filters),
    loadFacts(db, user, period, filters, "retours"),
    adjacentOf(db, period, -1),
    adjacentOf(db, period, 1),
  ]);
  const previousFacts = previous ? await loadFacts(db, user, previous, filters) : null;
  return {
    withCosts,
    current: summarize(facts, withCosts),
    previous: previousFacts ? summarize(previousFacts, withCosts) : null,
    previousPeriod: previous,
    nextPeriod: next,
    /** Une case par zone, dans le sens de la marche en avant. */
    zoneFlow: await zoneFlowTiles(db, user, filters, facts, previousFacts, withCosts, returns),
    /** Retours fournisseur, hors du total perdu (décision du 19/11/2026). */
    supplierReturns: summarize(returns, withCosts),
    /** Pertes évitables et familles de causes racines (décision du 23/11/2026). */
    lenses: causeLenses(facts, withCosts),
  };
}

/** Choix proposés dans la barre de filtres. */
export async function dashboardFilterOptions(db: Db) {
  const [zones, teams] = await Promise.all([
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones).orderBy(asc(s.zones.displayOrder)),
    db
      .select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName })
      .from(s.teams)
      .orderBy(asc(s.teams.displayOrder)),
  ]);
  return { zones, teams };
}

export interface ShareOfTotal {
  /** « équipe » : compte d'une équipe de cuisine ; « zones » : responsable de zone. */
  kind: "equipe" | "zones";
  /** « Équipe A – Bleue », ou les zones du compte. */
  label: string;
  own: StatsSummary;
  /** Pertes de la zone de l'équipe (toutes équipes confondues) ; absent pour un responsable de zone. */
  zone: { name: string; summary: StatsSummary } | null;
  /** Pertes de l'entreprise, toutes zones confondues. */
  total: StatsSummary;
}

/**
 * Part des pertes d'une équipe ou d'un responsable de zone dans le total (décision du 24/11/2026) : remplace les
 * pertes par zone, inutiles quand le compte ne voit qu'une zone. Équipe : part dans sa zone (Cuisine/production),
 * puis dans l'entreprise ; responsable de zone : part dans l'entreprise. Seuls les totaux des autres sont lus, jamais
 * leur détail. null pour les profils qui comparent les équipes (ils gardent les pertes par zone).
 */
export async function shareOfTotal(
  db: Db,
  user: AuthUser,
  period: Period,
  filters: StatsFilters,
): Promise<ShareOfTotal | null> {
  if (can(user, "stats.compare_teams")) return null;
  const withCosts = can(user, "indicators.read");
  const zones = await db.select({ id: s.zones.id, name: s.zones.name, order: s.zones.displayOrder }).from(s.zones);
  // Lecture des seuls totaux de l'entreprise : toutes les zones, comme un profil qui compare les équipes.
  const everyone: AuthUser = {
    ...user,
    teamId: null,
    team: null,
    zoneIds: zones.map((z) => z.id),
    permissions: new Set([...user.permissions, "stats.compare_teams"]),
  };
  const common = { category: filters.category };
  const [own, all] = await Promise.all([loadFacts(db, user, period, filters), loadFacts(db, everyone, period, common)]);
  const mine = zones.filter((z) => user.zoneIds.includes(z.id)).sort((a, b) => a.order - b.order);
  const names = mine.map((z) => zoneNameWithoutNumber(z.name)).join(", ");
  if (user.team) {
    return {
      kind: "equipe",
      label: `Équipe ${user.team.letter} – ${user.team.colorName}`,
      own: summarize(own, withCosts),
      zone: {
        name: names,
        summary: summarize(
          all.filter((f) => user.zoneIds.includes(f.zoneId)),
          withCosts,
        ),
      },
      total: summarize(all, withCosts),
    };
  }
  return {
    kind: "zones",
    label: `${mine.length > 1 ? "des zones" : "la zone"} ${names}`,
    own: summarize(own, withCosts),
    zone: null,
    total: summarize(all, withCosts),
  };
}
