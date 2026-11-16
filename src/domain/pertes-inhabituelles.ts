/**
 * Pertes inhabituelles (docs/PHASE6.md, étape 6.2 ; décisions du 16/11/2026).
 *
 * Une équipe, une zone ou un plat est signalé quand ses pertes de la semaine dépassent d'au moins 50 % la moyenne
 * de ses 4 semaines de production précédentes :
 * - à volume égal (kg pour 1 000 barquettes produites, « Décompte barquettes ») quand la production de la semaine
 *   et d'au moins 2 semaines de référence est connue ; sinon en kg ;
 * - jamais sous 5 kg de pertes dans la semaine ;
 * - semaines de référence : celles où l'unité était concernée (outil en service, équipe active, plat produit) ;
 *   il en faut au moins 2, sinon pas d'alerte.
 * Une moyenne de référence nulle (aucune perte avant) avec au moins 5 kg cette semaine est signalée, sans
 * pourcentage.
 */

export interface AlertSettings {
  /** Dépassement de la moyenne qui déclenche l'alerte (0,5 = +50 %). */
  unusualRate: number;
  /** Kg de pertes de la semaine en dessous desquels aucune alerte n'est émise. */
  minKg: number;
  /** Semaines de suite où la même cause est en tête (étape 6.3). */
  recurrenceWeeks: number;
  /** Écart sous lequel une tendance est stable (étape 6.1). */
  trendStableRate: number;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { unusualRate: 0.5, minKg: 5, recurrenceWeeks: 3, trendStableRate: 0.1 };

/** Semaines de référence avant la semaine analysée. */
export const REFERENCE_WEEKS = 4;
/** Semaines de référence concernées nécessaires. */
export const MIN_REFERENCE_WEEKS = 2;

export interface UnitWeek {
  /** Kg de pertes alimentaires de l'unité. */
  kg: number;
  /** Barquettes produites par l'unité (équipe, plat, ou toute l'entreprise pour une zone) ; null si inconnu. */
  produced: number | null;
  /** L'unité est concernée cette semaine (outil en service, équipe active, plat produit). */
  active: boolean;
}

export interface UnusualResult {
  measure: "kg_1000" | "kg";
  /** Valeur de la semaine et moyenne de référence, dans l'unité de la mesure. */
  value: number;
  reference: number;
  /** Dépassement (0,62 = +62 %) ; null quand la référence est nulle. */
  rate: number | null;
  referenceWeeks: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** Contrôle d'une unité : `history` = ses semaines précédentes (4 au plus, de la plus ancienne à la plus récente). */
export function checkUnusual(current: UnitWeek, history: readonly UnitWeek[], settings: Pick<AlertSettings, "unusualRate" | "minKg">): UnusualResult | null {
  if (current.kg < settings.minKg) return null;
  const refs = history.slice(-REFERENCE_WEEKS).filter((h) => h.active);
  if (refs.length < MIN_REFERENCE_WEEKS) return null;
  const withVolume = refs.filter((h) => (h.produced ?? 0) > 0);
  const perThousand = (w: UnitWeek) => (w.kg / w.produced!) * 1000;
  const useVolume = (current.produced ?? 0) > 0 && withVolume.length >= MIN_REFERENCE_WEEKS;
  const used = useVolume ? withVolume : refs;
  const value = round2(useVolume ? perThousand(current) : current.kg);
  const reference = round2(mean(used.map((w) => (useVolume ? perThousand(w) : w.kg))));
  const result = { measure: useVolume ? ("kg_1000" as const) : ("kg" as const), value, reference, referenceWeeks: used.length };
  if (reference === 0) return { ...result, rate: null };
  const rate = Math.round((value / reference - 1) * 1000) / 1000;
  return rate >= settings.unusualRate ? { ...result, rate } : null;
}
