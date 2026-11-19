/**
 * Cases par zone (marche en avant) de la vue générale et de la synthèse de la semaine (décision du 18/11/2026).
 * Un profil qui compare les équipes voit toutes ses zones cochées, sans filtre de lieu ; sinon, seulement les zones
 * où il a des pertes sur l'une des deux périodes (ou la zone filtrée).
 */
import { asc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { zoneFlow } from "@/domain/flux-zones";
import type { LossFact } from "@/domain/statistiques";
import { type AuthUser, can } from "@/modules/auth/permissions";
import type { StatsFilters } from "./facts";

export async function zoneFlowTiles(
  db: Db,
  user: AuthUser,
  filters: StatsFilters,
  current: readonly LossFact[],
  previous: readonly LossFact[] | null,
  withCosts: boolean,
) {
  const zones = await db
    .select({ id: s.zones.id, name: s.zones.name })
    .from(s.zones)
    .where(eq(s.zones.active, true))
    .orderBy(asc(s.zones.displayOrder));
  const tiles = zoneFlow(zones, current, previous, withCosts);
  if (can(user, "stats.compare_teams") && !filters.zoneId && !filters.subzoneId)
    return tiles.filter((t) => user.zoneIds.includes(t.zoneId));
  const seen = new Set([...current, ...(previous ?? [])].map((f) => f.zoneId));
  return tiles.filter((t) => seen.has(t.zoneId) || t.zoneId === filters.zoneId);
}
