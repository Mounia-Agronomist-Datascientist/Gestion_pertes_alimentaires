/**
 * Retours fournisseur (décision du 19/11/2026) : la part d'une perte renvoyée au fournisseur repart et donne
 * normalement un avoir. Elle n'est donc **pas comptée dans le total perdu** (kg, euros, zones, classements, alertes)
 * mais suivie à part. Une perte répartie (une partie renvoyée, le reste au compost) est coupée au prorata des
 * quantités affectées à chaque destination ; la recette d'une vente reste du côté des pertes.
 */
import { roundQuantity } from "./nombres";
import type { FactCost, LossFact } from "./statistiques";

export const SUPPLIER_RETURN_KIND = "retour_fournisseur";

const round2 = (n: number) => Math.round(n * 100) / 100;

function scaled(f: LossFact, share: number, destinations: LossFact["destinations"], keepRecovered: boolean): LossFact {
  const cost: FactCost | null = f.cost
    ? {
        materialEur: round2(f.cost.materialEur * share),
        packagingEur: round2(f.cost.packagingEur * share),
        labourEur: round2(f.cost.labourEur * share),
        indirectEur: round2(f.cost.indirectEur * share),
        grossEur: round2(f.cost.grossEur * share),
        recoveredEur: keepRecovered ? f.cost.recoveredEur : 0,
      }
    : null;
  return {
    ...f,
    netKg: f.netKg == null ? null : roundQuantity(f.netKg * share),
    netQuantity: roundQuantity(f.netQuantity * share),
    cost,
    destinations,
  };
}

/** Sépare les pertes (sans les retours) et les retours fournisseur (la part renvoyée de chaque perte). */
export function splitSupplierReturns(facts: readonly LossFact[]): { losses: LossFact[]; returns: LossFact[] } {
  const losses: LossFact[] = [];
  const returns: LossFact[] = [];
  for (const f of facts) {
    const back = f.destinations.filter((d) => d.kind === SUPPLIER_RETURN_KIND);
    if (!back.length) {
      losses.push(f);
      continue;
    }
    const rest = f.destinations.filter((d) => d.kind !== SUPPLIER_RETURN_KIND);
    const total = f.destinations.reduce((n, d) => n + d.quantity, 0);
    const share = total > 0 ? back.reduce((n, d) => n + d.quantity, 0) / total : 1;
    returns.push(scaled(f, share, back, false));
    if (rest.length && share < 1) losses.push(scaled(f, 1 - share, rest, true));
  }
  return { losses, returns };
}
