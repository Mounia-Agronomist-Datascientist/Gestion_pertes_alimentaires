import { REUSE_WINDOW_LABELS, type ReuseWindowKey } from "@/domain/plages-reutilisation";
import { addDays, formatProductionWeek } from "@/domain/semaine-production";
import { TEAM_DELAY_DAYS } from "@/modules/declarations/access";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export const fmtLongDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));

export function alertTitle(a: { window: ReuseWindowKey; weekYear: number; weekNumber: number }): string {
  return `Rien de noté ${REUSE_WINDOW_LABELS[a.window]} (${formatProductionWeek({ year: a.weekYear, number: a.weekNumber })})`;
}

/** Dernier jour où l'équipe peut encore déclarer une perte de la plage : 7 jours après son dernier jour. */
export function regularizationDeadline(lastDay: string): string {
  return addDays(lastDay, TEAM_DELAY_DAYS);
}
