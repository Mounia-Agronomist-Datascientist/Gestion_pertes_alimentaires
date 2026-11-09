/**
 * Lecture du classeur Excel téléchargé depuis Google Sheets (Fichier → Télécharger → Microsoft Excel).
 * Le classeur contient tous les onglets : seul l'onglet de la semaine demandée est lu. Les autres (dont celui
 * des chefs d'équipe, qui contient des noms et adresses e-mail) sont chargés en mémoire par la bibliothèque le
 * temps de la lecture, mais leur contenu n'est jamais lu, renvoyé ni enregistré.
 */
import ExcelJS from "exceljs";
import type { Grid } from "./parse-plan";

export interface OpenedWorkbook {
  /** Noms des onglets, dans l'ordre. */
  sheetNames: string[];
  /** Contenu d'un onglet, cellule par cellule, tel qu'affiché ; null si l'onglet n'existe pas. */
  readSheet(name: string): Grid | null;
}

/** Ouvre le classeur une seule fois (il peut peser plusieurs Mo) ; les onglets sont lus à la demande. */
export async function openWorkbook(data: Uint8Array): Promise<OpenedWorkbook> {
  const workbook = await load(data);
  return {
    sheetNames: workbook.worksheets.map((w) => w.name),
    readSheet(name) {
      const sheet = workbook.getWorksheet(name);
      if (!sheet) return null;
      const grid: string[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const values: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          values[colNumber - 1] = displayedText(cell);
        });
        grid[rowNumber - 1] = Array.from(values, (v) => v ?? "");
      });
      return Array.from(grid, (row) => row ?? []);
    },
  };
}

/** Noms des onglets du classeur, dans l'ordre. */
export async function listWorkbookSheets(data: Uint8Array): Promise<string[]> {
  return (await openWorkbook(data)).sheetNames;
}

/** Contenu d'un onglet (raccourci de `openWorkbook`). */
export async function readWorkbookSheet(data: Uint8Array, sheetName: string): Promise<Grid | null> {
  return (await openWorkbook(data)).readSheet(sheetName);
}

/** Nom de l'onglet d'une semaine : « S45 » pour l'année du plan, « S2552 » pour une autre année. */
export function expectedSheetNames(year: number, week: number): string[] {
  const ww = String(week).padStart(2, "0");
  return [`S${ww}`, `S${String(year).slice(-2)}${ww}`];
}

/**
 * Texte de la cellule tel qu'affiché dans Google Sheets : le classeur garde la valeur exacte (676,5) et le
 * format d'affichage (« 0 » → 677) ; on applique les formats numériques simples (« 0 », « 0.0 », « #,##0 »).
 */
export function displayedText(cell: Pick<ExcelJS.Cell, "value" | "numFmt" | "text">): string {
  const value = cell.value;
  const number =
    typeof value === "number" ? value : value && typeof value === "object" && "result" in value && typeof value.result === "number" ? value.result : null;
  const format = cell.numFmt?.match(/^[#,]*0(?:\.(0+))?$/);
  if (number == null || !format) return cell.text ?? "";
  return Number(number.toFixed(format[1]?.length ?? 0)).toString();
}

async function load(data: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return workbook;
}
