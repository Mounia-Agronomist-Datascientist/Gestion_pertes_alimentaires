/**
 * Lecture du fichier des Alchimistes (docs/PHASE5.md, étape 5.2) : export CSV ou Excel de leurs rendez-vous, une
 * ligne par bac.
 *
 * - Seules les lignes « collect » sont gardées ; les livraisons de bacs vides (« delivery », 0 kg) sont comptées
 *   puis ignorées.
 * - Les colonnes « Région », « Nom du client » et « Nom de l'établissement » ne sont jamais lues.
 * - La semaine de production est calculée à partir de la date (décision du 12/11/2026) ; la colonne
 *   « Correspondance aux semaines de prod », remplie à la main, ne sert qu'à signaler un écart.
 * - Le n° du bac est lu si une colonne « Identifiant » / « N° de contenant » apparaît (demandé aux Alchimistes).
 */
import { computeProductionWeek, formatProductionWeek } from "@/domain/semaine-production";
import type { Grid } from "../plan/parse-plan";

export interface AlchimistesCollection {
  /** AAAA-MM-JJ. */
  date: string;
  netKg: number;
  containerType: string | null;
  containerNumber: string | null;
  quality: number | null;
  incident: string | null;
  material: string | null;
  /** Semaine écrite dans le fichier (« S19 »). */
  fileWeek: string | null;
  /** Ligne dans le fichier (pour les messages). */
  row: number;
}

export interface AlchimistesParseResult {
  collections: AlchimistesCollection[];
  deliveries: number;
  /** Première et dernière date du fichier, livraisons comprises ; null sans aucune ligne datée. */
  periodFrom: string | null;
  periodTo: string | null;
  errors: string[];
  warnings: string[];
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Colonnes lues, reconnues par le début de leur titre (sans accents ni majuscules). */
const COLUMNS = {
  date: (h: string) => h === "date",
  type: (h: string) => h.startsWith("type de rdv"),
  count: (h: string) => h.startsWith("nombre de contenant"),
  containerType: (h: string) => h.startsWith("type de contenant"),
  containerNumber: (h: string) => /^(identifiant|n° de (contenant|bac)|numero de (contenant|bac))/.test(h),
  netKg: (h: string) => h.startsWith("poids net"),
  quality: (h: string) => h.startsWith("qualite"),
  incident: (h: string) => h.startsWith("incident"),
  material: (h: string) => h.startsWith("type de matiere"),
  fileWeek: (h: string) => h.startsWith("correspondance"),
} as const;
type Column = keyof typeof COLUMNS;
const REQUIRED: Column[] = ["date", "type", "netKg"];
const LABELS: Record<Column, string> = {
  date: "Date",
  type: "Type de rdv",
  count: "Nombre de contenant",
  containerType: "Type de contenant",
  containerNumber: "Identifiant du contenant",
  netKg: "Poids net (contenu déchets)",
  quality: "Qualite",
  incident: "Incident de collecte",
  material: "Type de matière",
  fileWeek: "Correspondance aux semaines de prod",
};

/** Date « 2026-04-30 », « 30/04/2026 » ou numéro de série Excel ; null si illisible. */
export function parseCollectionDate(text: string): string | null {
  const t = text.trim();
  let iso: string | null = null;
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: .*)?$/);
  if (ymd) iso = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  else if (dmy) iso = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  else if (/^\d{5}(\.\d+)?$/.test(t)) iso = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000).toISOString().slice(0, 10);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Poids « 21,4 », « 21.4 » ou « 21,4 kg » ; null si ce n'est pas un nombre positif. */
export function parseWeight(text: string): number | null {
  const t = text.replace(/\s|kg/gi, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 1000) / 1000;
}

const optional = (text: string | undefined, max = 120) => {
  const t = (text ?? "").trim();
  return t ? t.slice(0, max) : null;
};

export function parseAlchimistes(grid: Grid): AlchimistesParseResult {
  const result: AlchimistesParseResult = { collections: [], deliveries: 0, periodFrom: null, periodTo: null, errors: [], warnings: [] };
  const headerRow = grid.findIndex((r) => r.some((c) => COLUMNS.date(normalize(c))) && r.some((c) => COLUMNS.netKg(normalize(c))));
  if (headerRow < 0) {
    result.errors.push("Colonnes « Date » et « Poids net (contenu déchets) » introuvables : est-ce bien l'export des Alchimistes ?");
    return result;
  }
  const headers = grid[headerRow]!.map(normalize);
  const index = Object.fromEntries((Object.keys(COLUMNS) as Column[]).map((k) => [k, headers.findIndex(COLUMNS[k])])) as Record<Column, number>;
  const missing = REQUIRED.filter((k) => index[k] < 0);
  if (missing.length) {
    result.errors.push(`Colonne${missing.length > 1 ? "s" : ""} manquante${missing.length > 1 ? "s" : ""} : ${missing.map((k) => `« ${LABELS[k]} »`).join(", ")}.`);
    return result;
  }

  const dates: string[] = [];
  const weekGaps = new Map<string, number>();
  const otherTypes = new Map<string, number>();
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i]!;
    const cell = (k: Column) => (index[k] >= 0 ? (row[index[k]] ?? "") : "");
    if (row.every((c) => !c?.trim())) continue;
    const line = i + 1;
    const date = parseCollectionDate(cell("date"));
    if (!date) {
      result.errors.push(`Ligne ${line} : date illisible « ${cell("date")} ».`);
      continue;
    }
    dates.push(date);
    const type = normalize(cell("type"));
    if (type === "delivery") {
      result.deliveries++;
      continue;
    }
    if (type !== "collect") {
      otherTypes.set(cell("type") || "(vide)", (otherTypes.get(cell("type") || "(vide)") ?? 0) + 1);
      continue;
    }
    const netKg = parseWeight(cell("netKg"));
    if (netKg == null) {
      result.errors.push(`Ligne ${line} : poids illisible « ${cell("netKg")} ».`);
      continue;
    }
    if (netKg === 0) result.warnings.push(`Ligne ${line} (${date}) : collecte à 0 kg.`);
    const count = cell("count").trim();
    if (count && count !== "1") result.warnings.push(`Ligne ${line} (${date}) : ${count} contenants sur une seule ligne, poids gardé tel quel.`);
    const quality = /^\d$/.test(cell("quality").trim()) ? Number(cell("quality").trim()) : null;
    const fileWeek = optional(cell("fileWeek"), 10);
    const computed = computeProductionWeek(date);
    const fileNumber = fileWeek?.match(/^S?\s*(\d{1,2})$/i)?.[1];
    if (fileNumber && Number(fileNumber) !== computed.number) {
      const key = `${date} : « ${fileWeek} » dans le fichier, ${formatProductionWeek(computed)} d'après la date`;
      weekGaps.set(key, (weekGaps.get(key) ?? 0) + 1);
    }
    result.collections.push({
      date,
      netKg,
      containerType: optional(cell("containerType")),
      containerNumber: optional(cell("containerNumber"), 20),
      quality,
      incident: optional(cell("incident"), 300),
      material: optional(cell("material")),
      fileWeek,
      row: line,
    });
  }

  for (const [type, n] of otherTypes) result.warnings.push(`${n} ligne${n > 1 ? "s" : ""} de type « ${type} » ignorée${n > 1 ? "s" : ""} (ni collecte ni livraison).`);
  for (const [gap, n] of weekGaps) result.warnings.push(`Semaine différente (${n} bac${n > 1 ? "s" : ""}) — ${gap}. La semaine calculée est gardée.`);
  if (dates.length) {
    dates.sort();
    result.periodFrom = dates[0]!;
    result.periodTo = dates.at(-1)!;
  }
  if (!result.errors.length && !result.collections.length) result.errors.push("Aucune collecte dans ce fichier.");
  return result;
}

/** Découpe un texte CSV (séparateur « ; », « , » ou tabulation, détecté sur la ligne de titres ; guillemets gérés). */
export function csvToGrid(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/));
  const separator = ["\t", ";", ","].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === separator) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
