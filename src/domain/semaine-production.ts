/**
 * Règle R1 — Semaines de production (voir docs/REGLES_METIER.md).
 *
 * Une semaine de production va du jeudi au mercredi suivant. Son numéro et son année
 * sont ceux de la semaine ISO du lundi qu'elle contient (jeudi de début + 4 jours).
 *
 * Ces fonctions servent à GÉNÉRER le calendrier stocké en base. Pour rattacher une perte
 * à sa semaine, on utilise toujours le calendrier stocké (`findProductionWeek`), qui peut
 * avoir été corrigé par un administrateur.
 *
 * Les dates sont manipulées sous forme de chaînes « AAAA-MM-JJ » (dates calendaires sans
 * heure ni fuseau) pour éviter tout décalage lié aux fuseaux horaires.
 */

export type LocalDate = string;

export interface ProductionWeek {
  year: number;
  number: number;
  /** Jeudi de début (inclus). */
  startDate: LocalDate;
  /** Mercredi de fin (inclus). */
  endDate: LocalDate;
}

export const PRODUCTION_TIMEZONE = "Europe/Paris";

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtc(date: LocalDate): Date {
  if (!LOCAL_DATE_PATTERN.test(date)) {
    throw new Error(`Date invalide « ${date} » : format attendu AAAA-MM-JJ`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Date invalide « ${date} »`);
  }
  return parsed;
}

function fromUtc(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
function isoWeekday(date: LocalDate): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Année et numéro de semaine ISO 8601 d'une date. */
export function isoWeekOf(date: LocalDate): { year: number; number: number } {
  // Le jeudi de la semaine ISO détermine l'année ISO.
  const thursday = toUtc(addDays(date, 4 - isoWeekday(date)));
  const year = thursday.getUTCFullYear();
  const firstJan = Date.UTC(year, 0, 1);
  const number = Math.floor((thursday.getTime() - firstJan) / DAY_MS / 7) + 1;
  return { year, number };
}

/** Jeudi de début de la semaine de production contenant `date`. */
export function productionWeekStart(date: LocalDate): LocalDate {
  // jeudi = 4 ; nombre de jours écoulés depuis le dernier jeudi (0 à 6)
  const daysSinceThursday = (isoWeekday(date) - 4 + 7) % 7;
  return addDays(date, -daysSinceThursday);
}

/** Calcule la semaine de production théorique d'une date (règle de génération). */
export function computeProductionWeek(date: LocalDate): ProductionWeek {
  const startDate = productionWeekStart(date);
  const monday = addDays(startDate, 4);
  const { year, number } = isoWeekOf(monday);
  return { year, number, startDate, endDate: addDays(startDate, 6) };
}

/** Génère toutes les semaines de production d'une année de production, dans l'ordre. */
export function generateProductionCalendar(year: number): ProductionWeek[] {
  // La semaine 1 contient le lundi de la semaine ISO 1, qui tombe entre le 29/12 et le 04/01.
  let week = computeProductionWeek(`${year}-01-04`);
  while (week.number !== 1) {
    week = computeProductionWeek(addDays(week.startDate, week.year < year ? 7 : -7));
  }
  const weeks: ProductionWeek[] = [];
  while (week.year === year) {
    weeks.push(week);
    week = computeProductionWeek(addDays(week.startDate, 7));
  }
  return weeks;
}

/**
 * Retrouve dans le calendrier stocké la semaine contenant `date`.
 * Lève une erreur explicite si le calendrier ne couvre pas cette date :
 * on ne déduit jamais silencieusement une semaine.
 */
export function findProductionWeek<W extends ProductionWeek>(calendar: readonly W[], date: LocalDate): W {
  toUtc(date);
  const week = calendar.find((w) => w.startDate <= date && date <= w.endDate);
  if (!week) {
    throw new Error(`Aucune semaine de production paramétrée pour le ${date}`);
  }
  return week;
}

/** Libellé court, ex. « S46-2026 ». */
export function formatProductionWeek(week: Pick<ProductionWeek, "year" | "number">): string {
  return `S${String(week.number).padStart(2, "0")}-${week.year}`;
}

/** Date calendaire à Paris d'un instant (ex. horodatage de saisie). */
export function toProductionLocalDate(instant: Date): LocalDate {
  // Le format suédois produit directement « AAAA-MM-JJ ».
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: PRODUCTION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Une déclaration est tardive si elle est saisie dans une semaine postérieure à celle de la perte. */
export function isLateDeclaration(lossWeek: ProductionWeek, declarationWeek: ProductionWeek): boolean {
  return declarationWeek.startDate > lossWeek.startDate;
}
