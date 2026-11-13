/**
 * Rapprochement avec Les Alchimistes (docs/PHASE5.md, étape 5.3 ; cahier des charges §21).
 *
 * Pour une période (semaine de production ou mois) : kg déclarés vers Les Alchimistes comparés aux kg qu'ils ont
 * pesés. Le poids pesé est une mesure de contrôle, jamais ajoutée aux pertes. Un écart n'est pas une erreur : les
 * dates de collecte (un bac rempli un mercredi peut être collecté le jeudi suivant) et le contenu des bacs
 * (épluchures, restes non déclarés comme pertes) diffèrent des pertes déclarées.
 */
import { roundQuantity } from "./nombres";

export type ReconciliationStatus =
  /** Déclarations et pesées connues. */
  | "rapproche"
  /** Aucun fichier des Alchimistes ne couvre la période. */
  | "sans_fichier"
  /** Un fichier couvre la période mais ne contient aucune collecte. */
  | "sans_collecte"
  /** Pesées connues, aucune perte déclarée vers Les Alchimistes. */
  | "sans_declaration";

export interface ReconciliationInput {
  declaredKg: number;
  /** Lignes déclarées vers Les Alchimistes. */
  declaredLines: number;
  /** Lignes alimentaires sans poids en kg (non comptées). */
  notConverted: number;
  measuredKg: number;
  bins: number;
  /** Un fichier des Alchimistes couvre au moins un jour de la période. */
  covered: boolean;
}

export interface ReconciliationRow extends ReconciliationInput {
  status: ReconciliationStatus;
  /** Pesé − déclaré ; null si la période n'est pas rapprochée. */
  gapKg: number | null;
  /** Écart rapporté au poids pesé ; null sans pesée. */
  gapRate: number | null;
}

export function reconcile(input: ReconciliationInput): ReconciliationRow {
  const declaredKg = roundQuantity(input.declaredKg);
  const measuredKg = roundQuantity(input.measuredKg);
  const status: ReconciliationStatus = !input.covered ? "sans_fichier" : input.bins === 0 ? "sans_collecte" : input.declaredLines === 0 ? "sans_declaration" : "rapproche";
  const compared = status === "rapproche" || status === "sans_declaration";
  const gapKg = compared ? roundQuantity(measuredKg - declaredKg) : null;
  return {
    ...input,
    declaredKg,
    measuredKg,
    status,
    gapKg,
    gapRate: gapKg != null && measuredKg > 0 ? Math.round((gapKg / measuredKg) * 1000) / 1000 : null,
  };
}

/** Total de plusieurs périodes : seules les périodes rapprochées (ou pesées sans déclaration) entrent dans l'écart. */
export function reconcileTotal(rows: readonly ReconciliationRow[]): ReconciliationRow & { periods: number } {
  const compared = rows.filter((r) => r.gapKg != null);
  const sum = (key: "declaredKg" | "declaredLines" | "notConverted" | "measuredKg" | "bins") => compared.reduce((a, r) => a + r[key], 0);
  return {
    ...reconcile({
      declaredKg: sum("declaredKg"),
      declaredLines: sum("declaredLines"),
      notConverted: sum("notConverted"),
      measuredKg: sum("measuredKg"),
      bins: sum("bins"),
      covered: compared.length > 0,
    }),
    periods: compared.length,
  };
}

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  rapproche: "Rapprochée",
  sans_fichier: "Pesées non déposées",
  sans_collecte: "Aucune collecte",
  sans_declaration: "Rien de déclaré vers Les Alchimistes",
};
