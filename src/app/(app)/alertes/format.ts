import { REUSE_WINDOW_LABELS, type ReuseWindowKey } from "@/domain/plages-reutilisation";
import { addDays, formatProductionWeek } from "@/domain/semaine-production";
import { TEAM_DELAY_DAYS } from "@/modules/declarations/access";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export const fmtLongDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));

const shortDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric" });

/** « Jours non renseignés : lundi 2, mercredi 4 » */
export function missingDaysLabel(days: readonly string[]): string {
  if (days.length === 0) return "";
  const list = days.map((d) => shortDay.format(new Date(`${d}T12:00:00Z`))).join(", ");
  return `${days.length > 1 ? "Jours non renseignés" : "Jour non renseigné"} : ${list}`;
}

export function alertTitle(a: { window: ReuseWindowKey; weekYear: number; weekNumber: number }): string {
  return `Saisie incomplète ${REUSE_WINDOW_LABELS[a.window]} (${formatProductionWeek({ year: a.weekYear, number: a.weekNumber })})`;
}

/**
 * Dernier jour pour régulariser complètement l'alerte : 7 jours après le premier jour non renseigné
 * (au-delà, ce jour ne peut plus être déclaré par l'équipe).
 */
export function regularizationDeadline(alert: { missingDays: readonly string[]; lastDay: string }): string {
  return addDays(alert.missingDays[0] ?? alert.lastDay, TEAM_DELAY_DAYS);
}
