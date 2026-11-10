/**
 * Règle commune des valeurs datées (coûts d'emballage, taux de main-d'œuvre) : une nouvelle valeur s'applique à
 * partir d'une date et clôture la précédente la veille ; une valeur pas encore entrée en vigueur peut être corrigée
 * à la même date ; une valeur déjà appliquée n'est jamais réécrite.
 */
import type { LocalDate } from "./semaine-production";

export type DatedChange =
  | { kind: "nouvelle" }
  | { kind: "correction" }
  | { kind: "refus"; message: string };

const fr = (date: LocalDate) => date.split("-").reverse().join("/");

export function datedChange(latest: { validFrom: LocalDate } | null | undefined, validFrom: LocalDate, today: LocalDate): DatedChange {
  if (!latest || validFrom > latest.validFrom) return { kind: "nouvelle" };
  if (validFrom < latest.validFrom) {
    return { kind: "refus", message: `Une valeur plus récente existe déjà (à partir du ${fr(latest.validFrom)}) : choisissez une date ultérieure` };
  }
  if (latest.validFrom < today) return { kind: "refus", message: "Cette valeur est déjà appliquée : choisissez une date de début ultérieure" };
  return { kind: "correction" };
}
