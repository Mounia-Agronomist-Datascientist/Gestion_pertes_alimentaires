/**
 * Règle R8 — Plages de réutilisation des surplus et alerte « rien de noté » (docs/REGLES_METIER.md).
 *
 * Les surplus peuvent être réutilisés d'un jour de production à l'autre, sauf :
 * - après le vendredi : la DLC est trop courte pour les réutiliser le lundi ;
 * - après le mercredi : le lendemain commence une nouvelle semaine de production.
 *
 * Une semaine de production (jeudi → mercredi) se découpe donc en deux plages :
 * - « jeudi-vendredi » : jours de production du jeudi au dimanche (un samedi travaillé y est rattaché) ;
 * - « lundi-mercredi » : jours de production du lundi au mercredi.
 *
 * Chaque jour de production d'une plage doit avoir au moins une déclaration de l'équipe (règle confirmée
 * le 09/11/2026). Si au moins un jour n'est pas renseigné, l'équipe reçoit une perte estimée forfaitaire
 * pour la plage (une seule fois par plage, quel que soit le nombre de jours manquants).
 */
import { addDays, type LocalDate } from "./semaine-production";

/** Perte estimée attribuée par plage incomplète (valeur fixée par l'entreprise le 06/11/2026). */
export const ESTIMATED_LOSS_KG_PER_WINDOW = 150;

export type ReuseWindowKey = "jeudi_vendredi" | "lundi_mercredi";

export const REUSE_WINDOW_LABELS: Record<ReuseWindowKey, string> = {
  jeudi_vendredi: "du jeudi au vendredi",
  lundi_mercredi: "du lundi au mercredi",
};

export interface ReuseWindow {
  key: ReuseWindowKey;
  /** Premier et dernier jour de production de la plage. */
  firstDay: LocalDate;
  lastDay: LocalDate;
  /** Jours de production de la plage, dans l'ordre. */
  days: LocalDate[];
}

/**
 * Découpe les jours de production d'une semaine en plages de réutilisation.
 * `weekStart` est le jeudi de début ; `productionDays` les jours travaillés de cette semaine.
 * Une plage sans aucun jour travaillé (semaine courte) n'est pas renvoyée.
 */
export function reuseWindows(weekStart: LocalDate, productionDays: readonly LocalDate[]): ReuseWindow[] {
  const weekEnd = addDays(weekStart, 6);
  const monday = addDays(weekStart, 4);
  const days = [...new Set(productionDays)].filter((d) => d >= weekStart && d <= weekEnd).sort();
  if (days.length !== new Set(productionDays).size) {
    throw new Error("Des jours de production n'appartiennent pas à cette semaine");
  }
  const groups: [ReuseWindowKey, LocalDate[]][] = [
    ["jeudi_vendredi", days.filter((d) => d < monday)],
    ["lundi_mercredi", days.filter((d) => d >= monday)],
  ];
  return groups
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key, firstDay: list[0]!, lastDay: list.at(-1)!, days: list }));
}

/** Jours de production de la plage sans aucune déclaration, dans l'ordre. */
export function missingDays(window: Pick<ReuseWindow, "days">, declaredDays: Iterable<LocalDate>): LocalDate[] {
  const declared = new Set(declaredDays);
  return window.days.filter((d) => !declared.has(d));
}

/** Une plage peut être contrôlée le lendemain de son dernier jour (toutes les équipes ont terminé). */
export function isWindowClosed(window: Pick<ReuseWindow, "lastDay">, today: LocalDate): boolean {
  return today > window.lastDay;
}

/** Jours de production par défaut d'une semaine : jeudi, vendredi, lundi, mardi, mercredi. */
export function defaultProductionDays(weekStart: LocalDate): LocalDate[] {
  return [0, 1, 4, 5, 6].map((offset) => addDays(weekStart, offset));
}
