/**
 * Lecture ciblée d'un très gros classeur Excel (« Décompte barquettes » : environ 250 onglets, près de 50 Mo).
 * Charger tout le classeur (exceljs) sature la mémoire : on n'ouvre que la liste des onglets, puis le seul
 * onglet demandé. Les autres onglets (dont ceux des jours, qui comportent des noms d'opérateurs) ne sont jamais
 * décompressés ni lus. Les valeurs sont rendues brutes (nombres non formatés), ce qui suffit au décompte.
 */
import JSZip from "jszip";
import type { Grid } from "../plan/parse-plan";

export interface LightWorkbook {
  sheetNames: string[];
  readSheet(name: string): Promise<Grid | null>;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** Texte d'un élément de chaîne (`<si>` ou `<is>`) : concaténation de ses `<t>`. */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!)).join("");

/** Colonne « AB » → indice 27. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function openLightWorkbook(data: Uint8Array): Promise<LightWorkbook> {
  const zip = await JSZip.loadAsync(data);
  const read = (path: string) => zip.file(path)?.async("string") ?? Promise.resolve(null);
  const [workbook, rels] = await Promise.all([read("xl/workbook.xml"), read("xl/_rels/workbook.xml.rels")]);
  if (!workbook || !rels) throw new Error("Classeur Excel illisible");
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/\bId="([^"]+)"/)?.[1], m[0].match(/\bTarget="([^"]+)"/)?.[1]]));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = decode(m[0].match(/\bname="([^"]*)"/)?.[1] ?? "");
    const target = targets.get(m[0].match(/\br:id="([^"]+)"/)?.[1]) ?? "";
    return { name, path: target.startsWith("/") ? target.slice(1) : `xl/${target}` };
  });
  let shared: string[] | null = null;

  return {
    sheetNames: sheets.map((s) => s.name),
    async readSheet(name) {
      const sheet = sheets.find((s) => s.name === name);
      const xml = sheet ? await read(sheet.path) : null;
      if (!xml) return null;
      shared ??= [...((await read("xl/sharedStrings.xml")) ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
      const grid: string[][] = [];
      for (const row of xml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const cells: string[] = [];
        for (const c of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = c[1]!.match(/\br="([A-Z]+)\d+"/)?.[1];
          if (!ref) continue;
          const type = c[1]!.match(/\bt="([^"]+)"/)?.[1];
          const body = c[2] ?? "";
          const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
          const value = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? textOf(body) : v != null ? decode(v) : "";
          cells[columnIndex(ref)] = value;
        }
        grid[Number(row[1]) - 1] = Array.from(cells, (v) => v ?? "");
      }
      return Array.from(grid, (r) => r ?? []);
    },
  };
}
