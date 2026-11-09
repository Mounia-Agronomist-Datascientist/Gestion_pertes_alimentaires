/**
 * Lecture du classeur Excel téléchargé depuis Google Sheets (Fichier → Télécharger → Microsoft Excel).
 * Le classeur contient tous les onglets : seul l'onglet de la semaine demandée est lu. Les autres (dont celui
 * des chefs d'équipe, qui contient des noms et adresses e-mail) sont chargés en mémoire par la bibliothèque le
 * temps de la lecture, mais leur contenu n'est jamais lu, renvoyé ni enregistré.
 */
import ExcelJS from "exceljs";
import type { Grid } from "./parse-plan";

/** Noms des onglets du classeur, dans l'ordre. */
export async function listWorkbookSheets(data: Uint8Array): Promise<string[]> {
  const workbook = await load(data);
  return workbook.worksheets.map((w) => w.name);
}

/** Contenu d'un onglet, cellule par cellule, tel qu'affiché (résultat des formules). */
export async function readWorkbookSheet(data: Uint8Array, sheetName: string): Promise<Grid | null> {
  const sheet = (await load(data)).getWorksheet(sheetName);
  if (!sheet) return null;
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cell.text ?? "";
    });
    grid[rowNumber - 1] = Array.from(values, (v) => v ?? "");
  });
  return Array.from(grid, (row) => row ?? []);
}

async function load(data: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return workbook;
}
