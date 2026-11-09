// Données réelles S45 (tests/fixtures/s45) prêtes à l'emploi pour les tests d'import.
import { readFileSync } from "node:fs";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";

/** Texte positionné du tome S45 (tableaux seulement, sans commentaires). */
export function s45TomeItems(): PdfItem[] {
  const rows = JSON.parse(readFileSync("tests/fixtures/s45/tome-S45.items.json", "utf8")) as [number, number, number, number, number, string][];
  return rows.map(([page, x, y, width, size, text]) => ({ page, x, y, width, size, text }));
}

/** Onglet S45 du plan de production : chaque bloc de l'extrait replacé à sa position d'origine. */
export function s45PlanGrid(): string[][] {
  const fixture = JSON.parse(readFileSync("tests/fixtures/s45/plan-production-S45.json", "utf8")) as {
    blocks: Record<string, { range: string; rows: string[][] }>;
  };
  const grid: string[][] = [];
  for (const { range, rows } of Object.values(fixture.blocks)) {
    const [, colLetter, rowNumber] = range.match(/!([A-Z])(\d+)/)!;
    const top = Number(rowNumber) - 1;
    const left = colLetter!.charCodeAt(0) - 65;
    rows.forEach((values, i) => {
      const row = (grid[top + i] ??= []);
      values.forEach((v, j) => (row[left + j] = v));
    });
  }
  return Array.from(grid, (row) => Array.from(row ?? [], (v) => v ?? ""));
}
