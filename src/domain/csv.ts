/**
 * Fichiers CSV pour Excel en français (docs/PHASE4.md, étape 4.8) : séparateur « ; », virgule décimale, encodage
 * UTF-8 avec marque d'ordre (BOM) pour que les accents s'affichent correctement à l'ouverture.
 */
export type CsvValue = string | number | null | undefined;

const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4, useGrouping: false });

function cell(value: CsvValue): string {
  if (value == null) return "";
  const text = typeof value === "number" ? decimal.format(value) : value;
  // Une cellule qui commence par = + - @ serait lue comme une formule par Excel : on la neutralise.
  const safe = typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return `﻿${[headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}

export interface CsvTable {
  /** Titre du tableau (nom de l'onglet dans Excel). */
  title: string;
  headers: string[];
  rows: CsvValue[][];
}

/** Plusieurs tableaux dans un seul CSV : chacun précédé de son titre, séparés par une ligne vide. Un seul : sans titre. */
export function tablesToCsv(tables: readonly CsvTable[]): string {
  if (tables.length === 1) return toCsv(tables[0]!.headers, tables[0]!.rows);
  return `﻿${tables.map((t) => toCsv([t.title], [t.headers, ...t.rows]).slice(1)).join("\r\n")}`;
}
