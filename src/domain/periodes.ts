/**
 * Périodes des statistiques (docs/PHASE4.md, étape 4.1).
 *
 * - **Semaine** et **année** suivent le calendrier de production stocké (semaine jeudi → mercredi, règle R1) :
 *   une année regroupe ses semaines S01 à S52/S53, comme les comparaisons semaine par semaine.
 * - **Mois** et **période libre** portent sur la date réelle de la perte.
 *
 * La période précédente sert à l'évolution affichée au tableau de bord : semaine, mois ou année d'avant, ou pour
 * une période libre la même durée juste avant.
 */
import { addDays, daysBetween, type LocalDate } from "./semaine-production";

export type Period =
  | { kind: "semaine"; year: number; number: number }
  | { kind: "mois"; year: number; month: number }
  | { kind: "annee"; year: number }
  | { kind: "periode"; from: LocalDate; to: LocalDate };

export const PERIOD_KINDS = ["semaine", "mois", "annee", "periode"] as const;

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const pad = (n: number) => String(n).padStart(2, "0");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Premier et dernier jour d'un mois. */
export function monthBounds(year: number, month: number): { from: LocalDate; to: LocalDate } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

/**
 * Période voisine : la précédente (`step` = −1) ou la suivante (+1). Pour une semaine, `adjacentWeek` donne la
 * semaine voisine dans le calendrier stocké (la semaine 1 n'a pas forcément de semaine 0) ; null s'il ne la
 * connaît pas.
 */
export function adjacentPeriod(period: Period, step: -1 | 1, adjacentWeek?: { year: number; number: number } | null): Period | null {
  switch (period.kind) {
    case "semaine":
      return adjacentWeek ? { kind: "semaine", ...adjacentWeek } : null;
    case "mois": {
      const index = period.year * 12 + (period.month - 1) + step;
      return { kind: "mois", year: Math.floor(index / 12), month: (index % 12) + 1 };
    }
    case "annee":
      return { kind: "annee", year: period.year + step };
    case "periode": {
      const days = (daysBetween(period.from, period.to) + 1) * step;
      return { kind: "periode", from: addDays(period.from, days), to: addDays(period.to, days) };
    }
  }
}

/** Période précédente (évolution affichée au tableau de bord). */
export const previousPeriod = (period: Period, previousWeek?: { year: number; number: number } | null) => adjacentPeriod(period, -1, previousWeek);

const frDate = (d: LocalDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function periodLabel(period: Period): string {
  switch (period.kind) {
    case "semaine":
      return `S${pad(period.number)}-${period.year}`;
    case "mois":
      return `${MONTHS[period.month - 1]} ${period.year}`;
    case "annee":
      return `Année ${period.year}`;
    case "periode":
      return `du ${frDate(period.from)} au ${frDate(period.to)}`;
  }
}

/**
 * Lit une période dans les paramètres d'adresse (`periode=semaine&annee=2026&semaine=46`, `periode=mois&annee=2026&mois=11`,
 * `periode=annee&annee=2026`, `periode=periode&du=2026-11-01&au=2026-11-30`) ; null si elle est absente ou invalide.
 */
export function parsePeriod(params: Record<string, string | undefined>): Period | null {
  const year = Number(params.annee);
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;
  switch (params.periode) {
    case "semaine": {
      const number = Number(params.semaine);
      return validYear && Number.isInteger(number) && number >= 1 && number <= 53 ? { kind: "semaine", year, number } : null;
    }
    case "mois": {
      const month = Number(params.mois);
      return validYear && Number.isInteger(month) && month >= 1 && month <= 12 ? { kind: "mois", year, month } : null;
    }
    case "annee":
      return validYear ? { kind: "annee", year } : null;
    case "periode": {
      const { du: from, au: to } = params;
      if (!from || !to || !DATE.test(from) || !DATE.test(to) || from > to) return null;
      try {
        // Rejette les dates impossibles (31/02) ; au plus un an et un jour pour garder des calculs raisonnables.
        if (daysBetween(from, to) > 366) return null;
      } catch {
        return null;
      }
      return { kind: "periode", from, to };
    }
    default:
      return null;
  }
}

/** Paramètres d'adresse d'une période (inverse de `parsePeriod`). */
export function periodParams(period: Period): Record<string, string> {
  switch (period.kind) {
    case "semaine":
      return { periode: "semaine", annee: String(period.year), semaine: String(period.number) };
    case "mois":
      return { periode: "mois", annee: String(period.year), mois: String(period.month) };
    case "annee":
      return { periode: "annee", annee: String(period.year) };
    case "periode":
      return { periode: "periode", du: period.from, au: period.to };
  }
}
