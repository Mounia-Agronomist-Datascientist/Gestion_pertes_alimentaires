/**
 * Agrégats des statistiques de pertes (docs/PHASE4.md, étape 4.1 ; cahier des charges §19).
 *
 * Calculs purs sur des pertes déjà filtrées par le serveur (période, filtres, droits, annulées exclues) :
 * - kg alimentaires (poids net) d'un côté, unités non alimentaires (emballages, moules) de l'autre : jamais
 *   additionnés (§19.7) ; une perte alimentaire non convertie en kg est comptée à part, jamais estimée ;
 * - quantités par type de destination (détruite, compostée, donnée, vendue, réutilisée…) en kg ;
 * - coûts figés sur chaque perte (§18.5), seulement pour les profils qui voient les euros.
 */
import { roundQuantity } from "./nombres";

export interface FactCost {
  materialEur: number;
  packagingEur: number;
  labourEur: number;
  indirectEur: number;
  grossEur: number;
  recoveredEur: number;
}

export interface LossFact {
  id: string;
  occurredOn: string;
  productionWeekId: string;
  zoneId: string;
  subzoneId: string;
  teamId: string | null;
  category: string;
  /** Les emballages et moules ne sont jamais comptés dans les kg alimentaires. */
  food: boolean;
  /** Clé du produit pour les classements : code Melba (même formule d'une semaine à l'autre) ou nom. */
  productKey: string;
  productName: string;
  causeId: string;
  causeName: string;
  netKg: number | null;
  netQuantity: number;
  netUnitCode: string;
  /** null : perte sans coût connu, ou coûts non visibles pour ce profil. */
  cost: FactCost | null;
  destinations: { destinationId: string; kind: string; quantity: number; netKg: number | null }[];
}

export interface CostSummary extends FactCost {
  netEur: number;
  /** Pertes portant un coût. */
  valued: number;
}

export interface StatsSummary {
  events: number;
  /** Kg nets alimentaires. */
  foodKg: number;
  /** Pertes alimentaires sans conversion en kg (comptées à part). */
  foodNotConverted: number;
  /** Barquettes comptées (pertes saisies en barquettes). */
  barquettes: number;
  /** Pertes non alimentaires (emballages, moules) : par unité, jamais en kg alimentaires. */
  nonFood: { events: number; quantities: Record<string, number> };
  /** Kg alimentaires par type de destination. */
  kgByDestinationKind: Record<string, number>;
  /** null quand le profil ne voit pas les euros. */
  cost: CostSummary | null;
}

const COST_KEYS = ["materialEur", "packagingEur", "labourEur", "indirectEur", "grossEur", "recoveredEur"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(facts: readonly LossFact[], withCosts: boolean): StatsSummary {
  let foodKg = 0;
  let foodNotConverted = 0;
  let barquettes = 0;
  const nonFood = { events: 0, quantities: {} as Record<string, number> };
  const kgByDestinationKind: Record<string, number> = {};
  const cost = { materialEur: 0, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: 0, recoveredEur: 0, valued: 0 };

  for (const f of facts) {
    if (f.food) {
      if (f.netKg == null) foodNotConverted++;
      else foodKg += f.netKg;
      for (const d of f.destinations) if (d.netKg != null) kgByDestinationKind[d.kind] = (kgByDestinationKind[d.kind] ?? 0) + d.netKg;
    } else {
      nonFood.events++;
      nonFood.quantities[f.netUnitCode] = (nonFood.quantities[f.netUnitCode] ?? 0) + f.netQuantity;
    }
    if (f.netUnitCode === "barquette") barquettes += f.netQuantity;
    if (withCosts && f.cost) {
      cost.valued++;
      for (const k of COST_KEYS) cost[k] += f.cost[k];
    }
  }

  const roundAll = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, roundQuantity(v)]));
  return {
    events: facts.length,
    foodKg: roundQuantity(foodKg),
    foodNotConverted,
    barquettes: roundQuantity(barquettes),
    nonFood: { events: nonFood.events, quantities: roundAll(nonFood.quantities) },
    kgByDestinationKind: roundAll(kgByDestinationKind),
    cost: withCosts
      ? {
          ...(Object.fromEntries(COST_KEYS.map((k) => [k, round2(cost[k])])) as unknown as FactCost),
          netEur: round2(cost.grossEur - cost.recoveredEur),
          valued: cost.valued,
        }
      : null,
  };
}

/** Regroupe les pertes selon une clé (zone, équipe, cause…) ; une clé null (perte sans équipe) est ignorée. */
export function groupFacts<K extends string>(facts: readonly LossFact[], keyOf: (f: LossFact) => K | null): Map<K, LossFact[]> {
  const groups = new Map<K, LossFact[]>();
  for (const f of facts) {
    const key = keyOf(f);
    if (key == null) continue;
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  return groups;
}

/** Une ligne de classement : la clé et son agrégat. */
export interface RankedGroup<K extends string> {
  key: K;
  summary: StatsSummary;
}

export type RankBy = "kg" | "cout" | "evenements";

/** Agrège chaque groupe et le classe (kg alimentaires, coût brut ou nombre d'événements, décroissant). */
export function rankGroups<K extends string>(facts: readonly LossFact[], keyOf: (f: LossFact) => K | null, withCosts: boolean, by: RankBy = "kg"): RankedGroup<K>[] {
  const value = (s: StatsSummary) => (by === "kg" ? s.foodKg : by === "cout" ? (s.cost?.grossEur ?? 0) : s.events);
  return [...groupFacts(facts, keyOf)]
    .map(([key, list]) => ({ key, summary: summarize(list, withCosts) }))
    .sort((a, b) => value(b.summary) - value(a.summary) || b.summary.events - a.summary.events);
}

/** Évolution d'une valeur par rapport à la période précédente ; null sans base de comparaison. */
export function evolution(current: number, previous: number | null | undefined): { delta: number; percent: number | null } | null {
  if (previous == null) return null;
  return { delta: roundQuantity(current - previous), percent: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10 };
}
