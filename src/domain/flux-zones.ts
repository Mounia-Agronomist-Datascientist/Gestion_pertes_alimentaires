/**
 * Pertes par zone dans le sens de la marche en avant (Réception → Stockage → Cuisine → Conditionnement → Plonge),
 * décision du 18/11/2026 : une case par zone avec une jauge = **part de la zone dans les kg perdus** de la période,
 * le coût brut, les kg, et l'évolution des kg par rapport à la période précédente. Les retours fournisseur ne sont
 * pas dans les kg perdus (décision du 19/11/2026) : ils sont donnés à part dans la case de leur zone.
 */
import { type LossFact, summarize } from "./statistiques";

export interface ZoneFlowTile {
  zoneId: string;
  name: string;
  kg: number;
  /** Coût brut (null : euros non visibles pour ce profil). */
  grossEur: number | null;
  /** Part de la zone dans les kg perdus de la période (0 à 1). */
  share: number;
  /** Kg de la période précédente (null : pas de période précédente). */
  previousKg: number | null;
  /** Évolution des kg en part (0,12 = +12 %) ; null sans période précédente ou sans perte avant. */
  change: number | null;
  events: number;
  /** Pertes non converties en kg (comptées dans les déclarations, pas dans les kg). */
  notConverted: number;
  /** Retours fournisseur de la zone (hors kg perdus) ; null s'il n'y en a pas. */
  returned: { kg: number; grossEur: number | null; events: number } | null;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function zoneFlow(
  zones: readonly { id: string; name: string }[],
  current: readonly LossFact[],
  previous: readonly LossFact[] | null,
  withCosts: boolean,
  returns: readonly LossFact[] = [],
): ZoneFlowTile[] {
  const ofZone = (facts: readonly LossFact[], id: string) => facts.filter((f) => f.zoneId === id);
  const tiles = zones.map((z) => {
    const now = summarize(ofZone(current, z.id), withCosts);
    const before = previous ? summarize(ofZone(previous, z.id), withCosts) : null;
    const back = summarize(ofZone(returns, z.id), withCosts);
    return {
      zoneId: z.id,
      name: z.name,
      kg: now.foodKg,
      grossEur: withCosts ? (now.cost?.grossEur ?? 0) : null,
      share: 0,
      previousKg: before ? before.foodKg : null,
      change: before && before.foodKg > 0 ? round((now.foodKg - before.foodKg) / before.foodKg) : null,
      events: now.events,
      notConverted: now.foodNotConverted,
      returned: back.events
        ? { kg: back.foodKg, grossEur: withCosts ? (back.cost?.grossEur ?? 0) : null, events: back.events }
        : null,
    };
  });
  const total = tiles.reduce((n, t) => n + t.kg, 0);
  return tiles.map((t) => ({ ...t, share: total > 0 ? round(t.kg / total) : 0 }));
}
