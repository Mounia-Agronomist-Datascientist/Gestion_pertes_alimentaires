/** Classeur Excel d'un export de statistiques (docs/PHASE4.md, étape 4.8) : un onglet par tableau, en-têtes en gras. */
import ExcelJS from "exceljs";
import type { CsvTable } from "@/domain/csv";

/** Nom d'onglet accepté par Excel : 31 caractères au plus, sans : \ / ? * [ ], unique dans le classeur. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Tableau";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

export async function tablesToXlsx(tables: readonly CsvTable[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pertes — La Brigade de Véro";
  const used = new Set<string>();
  for (const table of tables) {
    const sheet = workbook.addWorksheet(sheetName(table.title, used), { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(table.headers).font = { bold: true };
    // Texte saisi (libellés) : jamais interprété comme une formule, ExcelJS écrit les chaînes telles quelles.
    for (const row of table.rows) sheet.addRow(row.map((v) => v ?? null));
    sheet.columns.forEach((column, i) => {
      const longest = Math.max(table.headers[i]?.length ?? 0, ...table.rows.map((r) => String(r[i] ?? "").length));
      column.width = Math.min(Math.max(longest + 2, 8), 60);
    });
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
