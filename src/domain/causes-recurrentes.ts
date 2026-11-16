/**
 * Causes récurrentes (docs/PHASE6.md, étape 6.3 ; décision du 16/11/2026) : alerte quand la même cause est en tête
 * des pertes d'une équipe ou d'un plat 3 semaines de production de suite.
 *
 * - Cause en tête d'une semaine : celle qui pèse le plus en kg de pertes alimentaires ; à égalité (ou sans kg),
 *   celle qui a le plus de pertes déclarées. Une égalité parfaite ne donne pas de cause en tête.
 * - Une semaine sans perte pour l'unité interrompt la série.
 * - Équipe : les dernières semaines de production consécutives. Plat : ses dernières semaines de production (il ne
 *   revient pas chaque semaine), consécutives ou non.
 */

export interface CauseWeight {
  causeId: string;
  causeName: string;
  kg: number;
  events: number;
}

/** Cause en tête d'une semaine ; null sans perte ou en cas d'égalité parfaite. */
export function topCause(causes: readonly CauseWeight[]): CauseWeight | null {
  const sorted = [...causes].sort((a, b) => b.kg - a.kg || b.events - a.events);
  const [first, second] = sorted;
  if (!first) return null;
  if (second && second.kg === first.kg && second.events === first.events) return null;
  return first;
}

export interface RecurringCause {
  causeId: string;
  causeName: string;
  /** Poids de la cause chaque semaine de la série, de la plus ancienne à la semaine analysée. */
  weeks: CauseWeight[];
}

/**
 * `weeks` : causes de l'unité pour chaque semaine retenue, de la plus ancienne à la semaine analysée (comprise).
 * Alerte si les `count` dernières ont toutes la même cause en tête.
 */
export function recurringCause(weeks: readonly (readonly CauseWeight[])[], count: number): RecurringCause | null {
  if (weeks.length < count) return null;
  const tops = weeks.slice(-count).map(topCause);
  const first = tops[0];
  if (!first || tops.some((t) => t?.causeId !== first.causeId)) return null;
  return { causeId: first.causeId, causeName: first.causeName, weeks: tops as CauseWeight[] };
}
