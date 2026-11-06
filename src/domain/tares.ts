/**
 * Règle R3 — Tares des gastros (voir docs/REGLES_METIER.md).
 *
 * Poids net = poids brut mesuré − (tare du support éventuel + Σ nombre × tare unitaire de chaque type de gastro).
 * Les tares utilisées sont renvoyées pour être conservées avec la déclaration.
 */
import { roundQuantity } from "./nombres";

export interface GastroLine {
  containerTypeId: string;
  /** Identifiant de la version de tare utilisée (container_tares.id). */
  tareId: string;
  unitTareKg: number;
  count: number;
  /** Capacité maximale de l'échelle pour ce type, si connue. */
  maxCount?: number | null;
}

export interface SupportTare {
  containerTypeId: string;
  tareId: string;
  unitTareKg: number;
}

export interface TareInput {
  grossKg: number;
  gastros: readonly GastroLine[];
  support?: SupportTare | null;
}

export interface TareLineResult {
  containerTypeId: string;
  tareId: string;
  count: number;
  tareKg: number;
}

export interface TareResult {
  grossKg: number;
  tareTotalKg: number;
  netKg: number;
  lines: TareLineResult[];
}

export class TareError extends Error {}

export function computeNetWeight(input: TareInput): TareResult {
  const { grossKg, gastros, support } = input;

  if (!Number.isFinite(grossKg) || grossKg <= 0) {
    throw new TareError("Le poids brut doit être supérieur à 0");
  }
  if (gastros.length === 0 && !support) {
    throw new TareError("Indiquez au moins un gastro ou un support");
  }

  const seen = new Set<string>();
  const lines: TareLineResult[] = gastros.map((g) => {
    if (seen.has(g.containerTypeId)) {
      throw new TareError("Chaque type de gastro ne doit apparaître qu'une fois");
    }
    seen.add(g.containerTypeId);
    if (!Number.isInteger(g.count) || g.count < 1) {
      throw new TareError("Le nombre de gastros doit être un entier supérieur ou égal à 1");
    }
    if (g.maxCount != null && g.count > g.maxCount) {
      throw new TareError(`Au plus ${g.maxCount} gastros de ce type sur une échelle`);
    }
    return {
      containerTypeId: g.containerTypeId,
      tareId: g.tareId,
      count: g.count,
      tareKg: roundQuantity(g.count * g.unitTareKg),
    };
  });

  if (support) {
    lines.push({
      containerTypeId: support.containerTypeId,
      tareId: support.tareId,
      count: 1,
      tareKg: roundQuantity(support.unitTareKg),
    });
  }

  const tareTotalKg = roundQuantity(lines.reduce((sum, l) => sum + l.tareKg, 0));
  const netKg = roundQuantity(grossKg - tareTotalKg);
  if (netKg <= 0) {
    throw new TareError(
      `Le poids brut (${grossKg} kg) doit être supérieur à la tare totale (${tareTotalKg} kg)`,
    );
  }

  return { grossKg: roundQuantity(grossKg), tareTotalKg, netKg, lines };
}
