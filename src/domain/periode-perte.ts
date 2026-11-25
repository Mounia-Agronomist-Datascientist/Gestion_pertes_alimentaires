/**
 * Pertes de plusieurs jours jetées en une fois (décision du 26/11/2026) : par exemple à la Réception, en sous-effectif,
 * les pertes de trois jours jetées le quatrième. On indique le premier jour ; le dernier est la date de la perte. Dans
 * les statistiques, les kg et les euros sont répartis à parts égales sur chaque jour de la période.
 */
import { addDays } from "./semaine-production";

/** 14 jours au plus (le premier jour est au plus 13 jours avant le dernier). */
export const MAX_PERIOD_DAYS = 14;

/** Jours d'une perte : le seul jour de la perte, ou chaque jour de la période (du premier au dernier). */
export function lossDays(occurredOn: string, periodStart: string | null | undefined): string[] {
  if (!periodStart || periodStart >= occurredOn) return [occurredOn];
  const days: string[] = [];
  for (let d = periodStart; d <= occurredOn && days.length < MAX_PERIOD_DAYS; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Erreur de saisie de la période, ou null. */
export function periodStartError(occurredOn: string, periodStart: string | null | undefined): string | null {
  if (!periodStart) return null;
  if (periodStart >= occurredOn) return "Le premier jour de la période doit être avant la date de la perte";
  if (periodStart < addDays(occurredOn, -(MAX_PERIOD_DAYS - 1)))
    return `Une période de ${MAX_PERIOD_DAYS} jours au plus`;
  return null;
}
