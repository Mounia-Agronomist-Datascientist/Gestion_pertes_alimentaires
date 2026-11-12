/**
 * Valorisation des pertes (docs/PHASE5.md, étape 5.1 ; cahier des charges §10.4 et §20.1).
 *
 * Ce que deviennent les pertes, en trois groupes (décisions du 12/11/2026) :
 * - avec recette : les ventes (Too Good To Go, vente flash), seules à porter un montant encaissé ;
 * - sans recette : ordures ménagères, compost (Les Alchimistes), don, personnel, autre ;
 * - à part : réutilisation dans une autre préparation et retours fournisseurs.
 *
 * La valorisation ne retire rien des pertes (§10.3) : elle dit seulement ce qu'elles sont devenues. Le coût des
 * produits d'une ligne de destination est le coût brut figé de la perte au prorata de la quantité affectée à
 * cette destination.
 */
import type { LossFact } from "./statistiques";
import { roundQuantity } from "./nombres";

export const RECOVERY_GROUPS = [
  { key: "avec_recette", label: "Avec recette", kinds: ["vente"] },
  { key: "sans_recette", label: "Sans recette", kinds: ["destruction", "compost", "don", "personnel", "autre"] },
  { key: "a_part", label: "À part : réutilisation et retours fournisseurs", kinds: ["reutilisation", "retour_fournisseur"] },
] as const;
export type RecoveryGroup = (typeof RECOVERY_GROUPS)[number]["key"];

export function recoveryGroupOf(kind: string): RecoveryGroup {
  return RECOVERY_GROUPS.find((g) => (g.kinds as readonly string[]).includes(kind))?.key ?? "sans_recette";
}

export interface RecoveryTotals {
  /** Lignes de destination (une perte répartie entre deux destinations compte dans chacune). */
  lines: number;
  /** Kg alimentaires affectés. */
  foodKg: number;
  /** Lignes alimentaires sans conversion en kg. */
  notConverted: number;
  /** Lignes non alimentaires (emballages, moules), jamais en kg. */
  nonFood: number;
  /** Euros : null quand le profil ne les voit pas. */
  cost: {
    /** Coût brut des produits, au prorata des quantités. */
    grossEur: number;
    /** Lignes sans coût connu. */
    unvalued: number;
    /** Recettes encaissées (ventes). */
    recoveredEur: number;
    /** Ventes dont la recette reste à saisir. */
    recoveryMissing: number;
    /** Kg des ventes dont la recette est saisie, pour la recette par kg. */
    kgWithRecovery: number;
  } | null;
}

export interface DestinationRecovery extends RecoveryTotals {
  destinationId: string;
  kind: string;
  group: RecoveryGroup;
}

const empty = (withCosts: boolean): RecoveryTotals => ({
  lines: 0,
  foodKg: 0,
  notConverted: 0,
  nonFood: 0,
  cost: withCosts ? { grossEur: 0, unvalued: 0, recoveredEur: 0, recoveryMissing: 0, kgWithRecovery: 0 } : null,
});

function add(t: RecoveryTotals, f: LossFact, d: LossFact["destinations"][number]) {
  t.lines++;
  if (!f.food) t.nonFood++;
  else if (d.netKg == null) t.notConverted++;
  else t.foodKg += d.netKg;
  if (!t.cost) return;
  if (f.cost && f.cost.grossEur > 0 && f.netQuantity > 0) t.cost.grossEur += (f.cost.grossEur * d.quantity) / f.netQuantity;
  else t.cost.unvalued++;
  if (d.kind === "vente") {
    if (d.recoveredEur == null) t.cost.recoveryMissing++;
    else {
      t.cost.recoveredEur += d.recoveredEur;
      if (f.food && d.netKg != null) t.cost.kgWithRecovery += d.netKg;
    }
  }
}

function round(t: RecoveryTotals): RecoveryTotals {
  return {
    ...t,
    foodKg: roundQuantity(t.foodKg),
    cost: t.cost
      ? {
          ...t.cost,
          grossEur: Math.round(t.cost.grossEur * 100) / 100,
          recoveredEur: Math.round(t.cost.recoveredEur * 100) / 100,
          kgWithRecovery: roundQuantity(t.cost.kgWithRecovery),
        }
      : null,
  };
}

/** Totaux par destination et par groupe ; les destinations sont classées par kg décroissants. */
export function recoverySummary(facts: readonly LossFact[], withCosts: boolean) {
  const byDestination = new Map<string, DestinationRecovery>();
  const byGroup = Object.fromEntries(RECOVERY_GROUPS.map((g) => [g.key, empty(withCosts)])) as Record<RecoveryGroup, RecoveryTotals>;
  for (const f of facts) {
    for (const d of f.destinations) {
      const group = recoveryGroupOf(d.kind);
      const row = byDestination.get(d.destinationId) ?? byDestination.set(d.destinationId, { destinationId: d.destinationId, kind: d.kind, group, ...empty(withCosts) }).get(d.destinationId)!;
      add(row, f, d);
      add(byGroup[group], f, d);
    }
  }
  return {
    destinations: [...byDestination.values()].map((r) => ({ ...r, ...round(r) })).sort((a, b) => b.foodKg - a.foodKg || b.lines - a.lines),
    groups: Object.fromEntries(Object.entries(byGroup).map(([k, t]) => [k, round(t)])) as Record<RecoveryGroup, RecoveryTotals>,
  };
}

/** Part du coût brut récupérée par les recettes ; null sans coût. */
export function recoveredShare(t: RecoveryTotals): number | null {
  return t.cost && t.cost.grossEur > 0 ? Math.round((t.cost.recoveredEur / t.cost.grossEur) * 1000) / 1000 : null;
}

/** Recette par kg vendu (ventes dont la recette est saisie) ; null sans kg. */
export function recoveryPerKg(t: RecoveryTotals): number | null {
  return t.cost && t.cost.kgWithRecovery > 0 ? Math.round((t.cost.recoveredEur / t.cost.kgWithRecovery) * 100) / 100 : null;
}
