/**
 * Lecture du « Décompte barquettes » (Google Sheets → Fichier → Télécharger → Microsoft Excel), docs/PHASE4.md
 * étape 4.6.
 *
 * Seul l'onglet récapitulatif de la semaine (« Semaine 45 ») est lu : colonne **« Ma production »** = barquettes
 * réellement produites dans la semaine, par code de plat (décision du 12/11/2026). Les onglets des jours
 * (« 2026 S45A Jeudi ») ne servent qu'à connaître l'année de la semaine : leur contenu, qui comporte des noms
 * d'opérateurs, n'est jamais lu. Seuls les codes et les nombres sont gardés.
 */
import type { Grid } from "../plan/parse-plan";

const RECAP_SHEET = /^Semaine (\d{1,2})$/;
const DAY_SHEET = /^(\d{4}) S(\d{2})[A-Z]\b/;
const CODE = /^[A-Z]{2,3}\d{2}$/;

export interface DecompteWeek {
  sheetName: string;
  year: number;
  week: number;
}

/**
 * Semaines disponibles dans le classeur : un onglet « Semaine NN » dont l'année est donnée par les onglets des
 * jours de la même semaine (« 2026 S45A Jeudi ») ; sans onglet de jour, la semaine est ignorée (année inconnue).
 */
export function decompteWeeks(sheetNames: readonly string[]): DecompteWeek[] {
  const years = new Map<number, number>();
  for (const name of sheetNames) {
    const m = name.match(DAY_SHEET);
    if (m) years.set(Number(m[2]), Math.max(years.get(Number(m[2])) ?? 0, Number(m[1])));
  }
  return sheetNames
    .map((sheetName) => {
      const m = sheetName.match(RECAP_SHEET);
      const week = m ? Number(m[1]) : null;
      const year = week != null ? years.get(week) : undefined;
      return week != null && year ? { sheetName, year, week } : null;
    })
    .filter((w): w is DecompteWeek => w != null)
    .sort((a, b) => b.year - a.year || b.week - a.week);
}

export interface DecompteRow {
  code: string;
  /** Barquettes réellement produites dans la semaine (« Ma production »). */
  made: number;
  /** Ligne dans l'onglet (pour les messages). */
  row: number;
}

export interface DecompteParseResult {
  rows: DecompteRow[];
  errors: string[];
  warnings: string[];
}

/** Nombre affiché (« 2 938 », « 2938 », « 2938,0 ») ; null si la cellule n'est pas un nombre. */
export function parseCount(text: string | undefined): number | null {
  const t = (text ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/**
 * Premier tableau de l'onglet : la ligne d'en-tête contient « Ma production » ; les codes sont dans la colonne
 * juste avant celle du premier jour (« A »). Le tableau s'arrête à la première ligne sans code ; les tableaux
 * plus bas (autres calculs) ne sont pas lus.
 */
export function parseDecompte(grid: Grid): DecompteParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const headerRow = grid.findIndex((row) => row.some((c) => /^ma production$/i.test(c.trim())));
  if (headerRow < 0) return { rows: [], errors: ["Colonne « Ma production » introuvable dans l'onglet"], warnings };
  const header = grid[headerRow]!.map((c) => c.trim());
  const madeCol = header.findIndex((c) => /^ma production$/i.test(c));
  const firstDay = header.findIndex((c, i) => i < madeCol && c === "A");
  const codeCol = firstDay - 1;
  if (codeCol < 0) return { rows: [], errors: ["Colonne des codes introuvable (avant la colonne « A »)"], warnings };

  const rows: DecompteRow[] = [];
  const seen = new Set<string>();
  for (let r = headerRow + 1; r < grid.length; r++) {
    const code = (grid[r]?.[codeCol] ?? "").trim();
    if (!code) break;
    if (!CODE.test(code)) {
      warnings.push(`Ligne ${r + 1} : « ${code} » n'est pas un code de plat, ignorée`);
      continue;
    }
    const made = parseCount(grid[r]?.[madeCol]);
    if (made == null) {
      warnings.push(`Ligne ${r + 1} : pas de nombre dans « Ma production » pour ${code}`);
      continue;
    }
    if (made < 0) {
      warnings.push(`Ligne ${r + 1} : production négative pour ${code}, ignorée`);
      continue;
    }
    if (seen.has(code)) {
      errors.push(`Le code ${code} apparaît deux fois (ligne ${r + 1})`);
      continue;
    }
    seen.add(code);
    rows.push({ code, made: Math.round(made), row: r + 1 });
  }
  if (!rows.length && !errors.length) errors.push("Aucune production lue dans l'onglet");
  return { rows, errors, warnings };
}
