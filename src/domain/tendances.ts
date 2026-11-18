/**
 * Tendances des pertes (docs/PHASE6.md, étape 6.1) : moyenne glissante sur 4 semaines et sens de la tendance.
 *
 * - Moyenne glissante d'une semaine : moyenne de cette semaine et des 3 précédentes, sur les valeurs connues ;
 *   il en faut au moins 2 (une semaine sans volume prévu n'a pas de kg pour 1 000 barquettes).
 * - Sens : moyenne des 4 dernières semaines comparée à celle des 4 semaines d'avant. « Stable » quand l'écart
 *   reste sous 10 % (seuil proposé le 16/11/2026), sinon « hausse » ou « baisse ».
 * Pour des pertes, une hausse est défavorable : c'est l'affichage qui le dit, pas ce calcul.
 */

export const TREND_WINDOW = 4;
/** Écart relatif en dessous duquel la tendance est dite stable. */
export const TREND_STABLE_RATE = 0.1;
/** Valeurs connues nécessaires dans une fenêtre de 4 semaines. */
const MIN_KNOWN = 2;

export type TrendDirection = "hausse" | "stable" | "baisse";

export interface Trend {
  /** Moyenne des 4 dernières semaines (semaine choisie comprise). */
  recent: number | null;
  /** Moyenne des 4 semaines d'avant. */
  previous: number | null;
  /** Écart relatif (0,25 = +25 %) ; null si la moyenne d'avant est nulle ou inconnue. */
  rate: number | null;
  /** null quand l'une des deux moyennes manque. */
  direction: TrendDirection | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function windowAverage(values: readonly (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  return known.length >= MIN_KNOWN ? round2(known.reduce((a, b) => a + b, 0) / known.length) : null;
}

/** Moyenne glissante sur 4 semaines pour chaque point (du plus ancien au plus récent) ; null au début de la série. */
export function movingAverage(values: readonly (number | null)[], window = TREND_WINDOW): (number | null)[] {
  return values.map((_, i) => (i + 1 < window ? null : windowAverage(values.slice(i + 1 - window, i + 1))));
}

/** Sens de la tendance d'une série (du plus ancien au plus récent, la semaine choisie en dernier). */
export function trendOf(
  values: readonly (number | null)[],
  stableRate = TREND_STABLE_RATE,
  window = TREND_WINDOW,
): Trend {
  const recent = values.length >= window ? windowAverage(values.slice(-window)) : null;
  const previous = values.length >= 2 * window ? windowAverage(values.slice(-2 * window, -window)) : null;
  if (recent == null || previous == null) return { recent, previous, rate: null, direction: null };
  if (previous === 0) return { recent, previous, rate: null, direction: recent > 0 ? "hausse" : "stable" };
  const rate = Math.round(((recent - previous) / previous) * 1000) / 1000;
  return { recent, previous, rate, direction: Math.abs(rate) < stableRate ? "stable" : rate > 0 ? "hausse" : "baisse" };
}

export const TREND_LABELS: Record<TrendDirection, string> = {
  hausse: "En hausse",
  stable: "Stable",
  baisse: "En baisse",
};
/** Symbole écrit à côté du libellé (jamais le sens par la seule couleur). */
export const TREND_SYMBOLS: Record<TrendDirection, string> = { hausse: "▲", stable: "=", baisse: "▼" };
