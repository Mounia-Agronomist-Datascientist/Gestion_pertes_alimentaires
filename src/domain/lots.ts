/**
 * N° de lot, DLC et photos d'une perte (décision du 23/11/2026, docs/REGLES_METIER.md R37).
 *
 * - Proposés à la Réception et au Stockage, facultatifs.
 * - Une perte peut porter plusieurs lots ou DLC (50 kg de carottes avec 3 DLC) : la quantité est répartie entre
 *   les lignes, dans l'unité de la quantité nette, et la somme doit faire la quantité de la perte.
 * - Lot et DLC sont tapés (la lecture automatique sur photo pourra venir plus tard) ; les photos servent de preuve
 *   et sont effacées au bout de 3 mois, le lot, la DLC et la quantité restent.
 */
import { roundQuantity } from "./nombres";
import { SPLIT_TOLERANCE } from "./destinations";

export const LOT_ZONE_CODES: readonly string[] = ["RECEPTION", "STOCKAGE"];
export const lotsAllowedIn = (zoneCode: string) => LOT_ZONE_CODES.includes(zoneCode);

export const MAX_LOT_LINES = 20;
export const MAX_PHOTOS = 4;
/** Taille maximale d'une photo reçue (JPEG déjà réduit sur l'appareil). */
export const MAX_PHOTO_BYTES = 600_000;
/** Plus grand côté d'une photo réduite sur l'appareil, en pixels : assez pour lire une étiquette. */
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_RETENTION_MONTHS = 3;

export interface LotLine {
  /** N° de lot tel qu'écrit sur l'étiquette ; null s'il manque. */
  lotNumber: string | null;
  /** DLC ou DDM (AAAA-MM-JJ) ; null si elle manque. */
  dlc: string | null;
  /** Quantité de ce lot, dans l'unité de la quantité nette de la perte. */
  quantity: number;
}

export class LotError extends Error {}

/**
 * DLC tapée au clavier numérique : « 25/11/26 », « 25/11/2026 », « 251126 », ou « 25/11 » (année : la prochaine
 * date à venir ou de moins de 6 mois). Renvoie AAAA-MM-JJ, ou null si la date n'existe pas.
 */
export function parseDlc(text: string, today: string): string | null {
  const digits = text.replace(/\D/g, "");
  const parts =
    text.includes("/") || text.includes(".") || text.includes("-")
      ? text
          .split(/[/.-]/)
          .map((p) => p.trim())
          .filter(Boolean)
      : digits.length === 4
        ? [digits.slice(0, 2), digits.slice(2, 4)]
        : digits.length === 6
          ? [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
          : digits.length === 8
            ? [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
            : [];
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const todayYear = Number(today.slice(0, 4));
  let year: number;
  if (parts[2] == null) {
    // Sans année : celle qui place la date au plus près d'aujourd'hui (une DLC de janvier tapée en décembre).
    year = todayYear;
    const candidate = isoDate(year, month, day);
    if (candidate && monthsBetween(today, candidate) < -6) year += 1;
  } else {
    const y = parts[2];
    year = y.length === 2 ? 2000 + Number(y) : y.length === 4 ? Number(y) : NaN;
  }
  return isoDate(year, month, day);
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function monthsBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (30.44 * 86_400_000);
}

/** « 2026-11-25 » → « 25/11/2026 ». */
export function formatDlc(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Contrôle les lignes de lot avant enregistrement : chaque ligne a un n° de lot ou une DLC et une quantité, et la
 * somme fait la quantité nette de la perte. Renvoie les lignes nettoyées (quantités arrondies).
 */
export function validateLots(total: number, lines: readonly LotLine[]): LotLine[] {
  if (lines.length > MAX_LOT_LINES) throw new LotError(`${MAX_LOT_LINES} lots au plus par perte`);
  const cleaned = lines.map((l) => ({
    lotNumber: l.lotNumber?.trim() || null,
    dlc: l.dlc || null,
    quantity: roundQuantity(l.quantity),
  }));
  for (const l of cleaned) {
    if (!l.lotNumber && !l.dlc) throw new LotError("Chaque ligne de lot doit avoir un n° de lot ou une DLC");
    if (!Number.isFinite(l.quantity) || l.quantity <= 0)
      throw new LotError("Chaque lot doit avoir une quantité supérieure à 0");
  }
  if (cleaned.length > 0) {
    const remaining = lotRemaining(total, cleaned);
    if (Math.abs(remaining) > SPLIT_TOLERANCE) {
      throw new LotError(
        remaining > 0
          ? `La somme des lots ne fait pas la quantité de la perte : il reste ${remaining} à répartir`
          : `La somme des lots dépasse la quantité de la perte de ${-remaining}`,
      );
    }
  }
  return cleaned;
}

/** Positif : reste à répartir entre les lots ; négatif : trop réparti. */
export function lotRemaining(total: number, lines: readonly { quantity: number }[]): number {
  return roundQuantity(total - lines.reduce((sum, l) => sum + (Number.isFinite(l.quantity) ? l.quantity : 0), 0));
}

/** Résumé d'un lot : « Lot A123 · DLC 25/11/2026 ». */
export function lotLabel(l: Pick<LotLine, "lotNumber" | "dlc">): string {
  return [
    l.lotNumber ? `Lot ${l.lotNumber}` : "Lot non indiqué",
    l.dlc ? `DLC ${formatDlc(l.dlc)}` : "DLC non indiquée",
  ].join(" · ");
}
