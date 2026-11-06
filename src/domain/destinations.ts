/**
 * Règle R4 — Répartition d'une perte entre destinations (voir docs/REGLES_METIER.md).
 *
 * Les quantités sont exprimées dans la même unité que la quantité nette déclarée.
 * Un écart n'est pas bloquant en soi : il exige une justification.
 */
import { roundQuantity } from "./nombres";

export const SPLIT_TOLERANCE = 0.001;

export interface DestinationLine {
  destinationId: string;
  quantity: number;
}

export type SplitStatus = "ok" | "ecart";

export interface SplitCheck {
  status: SplitStatus;
  allocated: number;
  /** Positif : reste à affecter ; négatif : trop affecté. */
  remaining: number;
}

export class DestinationError extends Error {}

export function checkDestinationSplit(total: number, lines: readonly DestinationLine[]): SplitCheck {
  if (lines.length === 0) {
    throw new DestinationError("Choisissez au moins une destination");
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.destinationId)) {
      throw new DestinationError("Une destination ne doit apparaître qu'une fois");
    }
    seen.add(line.destinationId);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new DestinationError("Chaque quantité affectée doit être supérieure à 0");
    }
  }
  const allocated = roundQuantity(lines.reduce((sum, l) => sum + l.quantity, 0));
  const remaining = roundQuantity(total - allocated);
  return {
    status: Math.abs(remaining) <= SPLIT_TOLERANCE ? "ok" : "ecart",
    allocated,
    remaining,
  };
}

/**
 * Valide une répartition avant enregistrement : en cas d'écart, une justification non vide est exigée.
 * Retourne la justification nettoyée (ou null si la répartition est exacte).
 */
export function validateDestinationSplit(
  total: number,
  lines: readonly DestinationLine[],
  justification?: string | null,
): { check: SplitCheck; justification: string | null } {
  const check = checkDestinationSplit(total, lines);
  if (check.status === "ok") {
    return { check, justification: null };
  }
  const cleaned = justification?.trim() ?? "";
  if (cleaned === "") {
    const detail =
      check.remaining > 0
        ? `il reste ${check.remaining} à affecter`
        : `${-check.remaining} de trop ont été affectés`;
    throw new DestinationError(`La répartition ne correspond pas à la quantité déclarée (${detail}) : corrigez ou justifiez`);
  }
  return { check, justification: cleaned };
}
