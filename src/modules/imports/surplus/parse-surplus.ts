/**
 * Lecture des fichiers de ventes et de dons des surplus de barquettes (docs/PHASE5.md, étape 5.8), téléchargés
 * depuis Google Sheets en Excel. Le type de fichier est reconnu tout seul :
 * - « VENTES TGTG » : onglets « TGTG2024 », « TGTG2025 »… ;
 * - « VENTES FLASH » : onglets « VF2024 », « VF2025 »… ;
 * - « Gestion des surplus barquettes pour association Linkee » : onglet dont les titres commencent par
 *   « Date de collecte ».
 *
 * Règles de lecture (décisions du 13/11/2026 et du 16/11/2026) :
 * - TGTG : une ligne avec des barquettes vendues est une vente (montant : « CA TGTG », prix payé par les
 *   clients) ; un montant dans « RESULTAT REEL » est un versement reçu de Too Good To Go, HT après commission.
 *   Les colonnes de stock (« Nb barquettes à vendre », « vendues en VF ») ne sont pas reprises : les ventes flash
 *   viennent de leur propre fichier.
 * - Vente flash : « 41 dt 18 avec PDJ » = 41 boxes, dont 18 avec 5 barquettes de petit-déjeuner ;
 *   « 70 (dont 22 x 2box) » = 70 boxes, dont 22 achetées par deux (déjà comptées dans les 70). Une box « 10P »
 *   contient 10 barquettes de plats. Montant : « Chiffre d'affaire TTC ».
 * - Linkee : une ligne par plat ; la date de collecte vaut pour les lignes suivantes sans date. Le n° de lot donne
 *   la date de production et le code plat (« L41-071026-L2-VI01 »). Seules les colonnes de la collecte sont lues :
 *   les contacts (prénoms, téléphones) ne le sont jamais.
 */
import type { Grid } from "../plan/parse-plan";

export type SurplusSource = "tgtg" | "vente_flash" | "linkee";

export const SURPLUS_SOURCE_LABELS: Record<SurplusSource, string> = {
  tgtg: "Too Good To Go",
  vente_flash: "Ventes flash",
  linkee: "Linkee",
};

/** Barquettes de petit-déjeuner d'une box vendue « avec PDJ » (précision du 16/11/2026). */
export const BREAKFAST_TRAYS_PER_BOX = 5;

export interface SurplusEntry {
  kind: "vente" | "versement" | "don";
  /** AAAA-MM-JJ. */
  date: string;
  trays: number;
  breakfastTrays: number;
  offeredTrays: number | null;
  boxes: number | null;
  breakfastBoxes: number | null;
  formula: string | null;
  amountEur: number | null;
  code: string | null;
  note: string | null;
  dishName: string | null;
  lot: string | null;
  dishCode: string | null;
  producedOn: string | null;
  bestBefore: string | null;
  collected: boolean | null;
  /** Onglet et ligne dans le fichier (pour les messages). */
  sheet: string;
  row: number;
}

export interface SurplusParseResult {
  source: SurplusSource | null;
  sheets: string[];
  entries: SurplusEntry[];
  periodFrom: string | null;
  periodTo: string | null;
  errors: string[];
  warnings: string[];
}

export interface NamedGrid {
  name: string;
  grid: Grid;
}

const normalize = (s: string | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const blank = (s: string | undefined) => !(s ?? "").trim();

const validIso = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

/**
 * Date d'une cellule : numéro de série Excel, « 30/01/26 », « 30/01/2026 », « 2026-01-30 », ou « 30/1 » complété
 * par l'année de l'onglet. null si ce n'est pas une date.
 */
export function parseSheetDate(text: string | undefined, year?: number): string | null {
  const t = (text ?? "").trim();
  let iso: string | null = null;
  const serial = t.match(/^(\d{5})(?:\.0+)?$/);
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (serial) iso = new Date(Date.UTC(1899, 11, 30) + Number(serial[1]) * 86_400_000).toISOString().slice(0, 10);
  else if (ymd) iso = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  else if (dmy) {
    const y = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : year;
    if (!y) return null;
    iso = `${y}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  return iso && validIso(iso) ? iso : null;
}

/** Nombre « 1 999,20 € », « 6560.23 », « 474 » ; null si vide ou illisible. */
export function parseAmount(text: string | undefined): number | null {
  const t = (text ?? "").replace(/[\s  €]/g, "");
  if (!t) return null;
  const n = /^-?\d+(,\d+)?$/.test(t) ? Number(t.replace(",", ".")) : /^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(t) ? Number(t) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Nombre entier positif ou nul ; null si vide ou illisible. */
function parseCount(text: string | undefined): number | null {
  const n = parseAmount(text);
  return n != null && n >= 0 && Number.isInteger(n) ? n : null;
}

/** Repère la ligne de titres et l'indice de chaque colonne cherchée (−1 si absente). */
function locate<C extends Record<string, (h: string) => boolean>>(grid: Grid, columns: C, required: (keyof C)[]) {
  type K = keyof C & string;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const headers = (grid[r] ?? []).map(normalize);
    const index = Object.fromEntries((Object.keys(columns) as K[]).map((k) => [k, headers.findIndex(columns[k]!)])) as Record<K, number>;
    if (required.every((k) => index[k as K] >= 0)) return { headerRow: r, index };
  }
  return null;
}

const empty = (source: SurplusSource | null, sheets: string[]): SurplusParseResult => ({ source, sheets, entries: [], periodFrom: null, periodTo: null, errors: [], warnings: [] });

const base = (sheet: string, row: number, date: string): SurplusEntry => ({
  kind: "vente",
  date,
  trays: 0,
  breakfastTrays: 0,
  offeredTrays: null,
  boxes: null,
  breakfastBoxes: null,
  formula: null,
  amountEur: null,
  code: null,
  note: null,
  dishName: null,
  lot: null,
  dishCode: null,
  producedOn: null,
  bestBefore: null,
  collected: null,
  sheet,
  row,
});

const text = (t: string | undefined, max = 200) => {
  const v = (t ?? "").trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : null;
};

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ─── Too Good To Go ──────────────────────────────────────────────────────────

const TGTG_COLUMNS = {
  date: (h: string) => h === "date",
  offered: (h: string) => h.includes("proposees tgtg"),
  sold: (h: string) => h.includes("vendues tgtg"),
  formula: (h: string) => h.startsWith("formule"),
  revenue: (h: string) => h === "ca tgtg",
  payout: (h: string) => h.startsWith("resultat reel"),
};

function parseTgtgSheet(name: string, year: number, grid: Grid, out: SurplusParseResult) {
  const found = locate(grid, TGTG_COLUMNS, ["date", "sold", "revenue"]);
  if (!found) {
    out.errors.push(`Onglet ${name} : colonnes « Date », « Nb barquettes vendues TGTG » et « CA TGTG » introuvables.`);
    return;
  }
  const { headerRow, index } = found;
  const cell = (row: readonly string[], k: keyof typeof TGTG_COLUMNS) => (index[k] >= 0 ? row[index[k]] : undefined);
  let lastDate: string | null = null;
  let missingRevenue = 0;
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const line = i + 1;
    const offered = parseCount(cell(row, "offered"));
    const sold = parseCount(cell(row, "sold"));
    const revenue = parseAmount(cell(row, "revenue"));
    const payout = parseAmount(cell(row, "payout"));
    const rawDate = cell(row, "date");
    let date = parseSheetDate(rawDate, year);
    // Ligne de l'année seule (« 2025 ») ou ligne sans rien.
    if (!date && (offered == null && sold == null && revenue == null && payout == null)) continue;
    if (!date) {
      if (!lastDate) {
        out.warnings.push(`${name}, ligne ${line} : pas de date (« ${(rawDate ?? "").trim()} »), ligne ignorée.`);
        continue;
      }
      date = lastDate;
      out.warnings.push(`${name}, ligne ${line} : « ${(rawDate ?? "").trim()} » n'est pas une date ; la date de la ligne précédente (${shortDate(date)}) est gardée.`);
    } else {
      if (Number(date.slice(0, 4)) !== year) {
        const fixed = `${year}${date.slice(4)}`;
        out.warnings.push(`${name}, ligne ${line} : date du ${shortDate(date)} dans l'onglet ${year} ; le ${shortDate(fixed)} est gardé.`);
        date = fixed;
      }
      if (lastDate && date < lastDate) out.warnings.push(`${name}, ligne ${line} : le ${shortDate(date)} vient après le ${shortDate(lastDate)} ; vérifiez la date.`);
      lastDate = date;
    }
    if (sold != null || offered != null) {
      if (sold == null) out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : ${offered} barquettes proposées sans nombre de vendues, ligne ignorée.`);
      else {
        if (offered != null && sold > offered) out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : ${sold} barquettes vendues pour ${offered} proposées.`);
        if (revenue == null && sold > 0) missingRevenue++;
        out.entries.push({ ...base(name, line, date), kind: "vente", trays: sold, offeredTrays: offered, formula: text(cell(row, "formula"), 60), amountEur: revenue });
      }
    } else if (revenue != null) out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : montant sans barquettes vendues, ligne ignorée.`);
    if (payout != null) out.entries.push({ ...base(name, line, date), kind: "versement", amountEur: payout });
  }
  if (missingRevenue) out.warnings.push(`${name} : ${missingRevenue} vente${missingRevenue > 1 ? "s" : ""} sans « CA TGTG ».`);
}

// ─── Ventes flash ────────────────────────────────────────────────────────────

const VF_COLUMNS = {
  date: (h: string) => h === "date",
  code: (h: string) => h === "code",
  formula: (h: string) => h.startsWith("type de formule"),
  boxes: (h: string) => h.startsWith("quantites boxes"),
  revenue: (h: string) => h.startsWith("chiffre d'affaire"),
};

/**
 * Quantité de boxes : le premier nombre ; « dt 18 avec PDJ » / « dont 16 PDJ » = boxes avec petit-déjeuner ;
 * « dont 22 x 2box », « 11x2 » = achats de deux boxes (déjà comptés dans le premier nombre). null si illisible.
 */
export function parseBoxes(raw: string | undefined): { boxes: number; breakfastBoxes: number | null; doubles: number | null } | null {
  const t = normalize(raw).replace(/^(\d+)\.0+$/, "$1");
  const m = t.match(/^(\d+)(?:\s|\(|$)/);
  if (!m) return null;
  const rest = t.slice(m[1]!.length);
  const breakfast = rest.match(/(\d+)\s*(?:avec\s*)?pdj/);
  const doubles = rest.match(/(\d+)\s*x\s*2/);
  return { boxes: Number(m[1]), breakfastBoxes: breakfast ? Number(breakfast[1]) : null, doubles: doubles ? Number(doubles[1]) : null };
}

function parseFlashSheet(name: string, year: number, grid: Grid, out: SurplusParseResult) {
  const found = locate(grid, VF_COLUMNS, ["date", "formula", "boxes"]);
  if (!found) {
    out.errors.push(`Onglet ${name} : colonnes « Date », « Type de formule » et « Quantités boxes vendues » introuvables.`);
    return;
  }
  const { headerRow, index } = found;
  const cell = (row: readonly string[], k: keyof typeof VF_COLUMNS) => (index[k] >= 0 ? row[index[k]] : undefined);
  const lastColumn = Math.max(...Object.values(index));
  let missingRevenue = 0;
  if (index.revenue < 0) out.warnings.push(`${name} : pas de colonne « Chiffre d'affaire TTC » ; ventes enregistrées sans montant.`);
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    if (row.every(blank)) continue;
    const line = i + 1;
    const date = parseSheetDate(cell(row, "date"), year);
    if (!date) {
      if (!blank(cell(row, "boxes"))) out.warnings.push(`${name}, ligne ${line} : date illisible « ${(cell(row, "date") ?? "").trim()} », ligne ignorée.`);
      continue;
    }
    const formula = text(cell(row, "formula"), 60) ?? "";
    const boxes = parseBoxes(cell(row, "boxes"));
    if (!boxes) {
      out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : quantité « ${(cell(row, "boxes") ?? "").trim()} » illisible, vente ignorée.`);
      continue;
    }
    const perBox = Number(normalize(formula).match(/(\d+)\s*p\b/)?.[1] ?? NaN);
    if (!Number.isFinite(perBox)) {
      out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : formule « ${formula} » sans nombre de barquettes par box, vente ignorée.`);
      continue;
    }
    // Petits-déjeuners : nombre écrit (« dt 18 avec PDJ »), toutes les boxes si la formule n'existe qu'avec PDJ.
    const f = normalize(formula);
    const onlyBreakfast = /\+\s*pdj/.test(f) && !f.includes("/");
    let breakfastBoxes = boxes.breakfastBoxes ?? (onlyBreakfast ? boxes.boxes : 0);
    if (boxes.breakfastBoxes == null && !onlyBreakfast && /pdj/.test(f)) {
      out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : formule « ${formula} » sans nombre de boxes avec petit-déjeuner ; comptées sans petit-déjeuner.`);
      breakfastBoxes = 0;
    }
    if (breakfastBoxes > boxes.boxes) {
      out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : plus de boxes avec petit-déjeuner que de boxes ; vente ignorée.`);
      continue;
    }
    const revenue = parseAmount(cell(row, "revenue"));
    if (revenue == null && index.revenue >= 0 && boxes.boxes > 0) missingRevenue++;
    const comments = row.slice(lastColumn + 1).map((c) => text(c, 200)).filter(Boolean);
    out.entries.push({
      ...base(name, line, date),
      kind: "vente",
      boxes: boxes.boxes,
      breakfastBoxes,
      trays: boxes.boxes * perBox,
      breakfastTrays: breakfastBoxes * BREAKFAST_TRAYS_PER_BOX,
      formula,
      amountEur: revenue,
      code: text(cell(row, "code"), 40),
      note: [boxes.doubles ? `dont ${boxes.doubles} achats de 2 boxes` : null, ...comments].filter(Boolean).join(" · ") || null,
    });
  }
  if (missingRevenue) out.warnings.push(`${name} : ${missingRevenue} vente${missingRevenue > 1 ? "s" : ""} sans chiffre d'affaires.`);
}

// ─── Linkee ──────────────────────────────────────────────────────────────────

const LINKEE_COLUMNS = {
  date: (h: string) => h.startsWith("date de collecte"),
  total: (h: string) => h.startsWith("nombre total"),
  trays: (h: string) => h.startsWith("nombre de barquette"),
  dish: (h: string) => h.startsWith("nom plat"),
  lot: (h: string) => /^n\W*\s*lot/.test(h),
  bestBefore: (h: string) => h === "dlc",
  collected: (h: string) => h.startsWith("collecte"),
};

/**
 * N° de lot « L41-071026-L2-VI01 » → semaine de production (41), date de production et code plat (chacun null
 * s'il ne se lit pas).
 */
export function parseLot(lot: string): { week: number | null; producedOn: string | null; dishCode: string | null } {
  const t = lot.trim().toUpperCase();
  const week = t.match(/^L(\d{1,2})\b/)?.[1];
  if (!week) return { week: null, producedOn: null, dishCode: null };
  const dishCode = t.match(/(?:^|[^A-Z])([A-Z]{2}\d{2})\s*$/)?.[1] ?? null;
  const d = t.match(/^L\d{1,2}-(\d{2})(\d{2})(\d{2})-/);
  const producedOn = d && validIso(`20${d[3]}-${d[2]}-${d[1]}`) ? `20${d[3]}-${d[2]}-${d[1]}` : null;
  return { week: Number(week) >= 1 && Number(week) <= 53 ? Number(week) : null, producedOn, dishCode };
}

/** Texte d'un n° de lot : un nombre lu en notation scientifique (« 2.0260203E7 ») redevient « 20260203 ». */
const lotText = (raw: string | undefined) => {
  const t = (raw ?? "").trim();
  return /^\d+(\.\d+)?E\d+$/i.test(t) || /^\d+\.0+$/.test(t) ? String(Math.round(Number(t))) : t;
};

/** Total « 180 + 144 yaourts » → 324 ; null sans aucun nombre. */
function sumOfNumbers(raw: string | undefined): number | null {
  const numbers = (raw ?? "").match(/\d+(?:\.\d+)?/g);
  return numbers ? numbers.reduce((a, n) => a + Math.round(Number(n)), 0) : null;
}

function parseLinkeeSheet(name: string, grid: Grid, out: SurplusParseResult) {
  const found = locate(grid, LINKEE_COLUMNS, ["date", "trays", "dish"]);
  if (!found) {
    out.errors.push(`Onglet ${name} : colonnes « Date de collecte », « Nombre de barquette » et « Nom plat » introuvables.`);
    return;
  }
  const { headerRow, index } = found;
  // Seules ces colonnes sont lues ; les colonnes suivantes (contacts) jamais.
  const cell = (row: readonly string[] | undefined, k: keyof typeof LINKEE_COLUMNS) => (row && index[k] >= 0 ? row[index[k]] : undefined);
  const keys = Object.keys(LINKEE_COLUMNS) as (keyof typeof LINKEE_COLUMNS)[];
  // Une collecte : une date ; le total n'est écrit que sur sa première ligne (parfois en deux fois).
  let current = null as { date: string; total: number | null; sum: number } | null;
  let notCollected = 0;
  let unreadLots = 0;
  const closeCollection = () => {
    if (current && current.total != null && current.sum !== current.total) {
      out.warnings.push(`${name}, collecte du ${shortDate(current.date)} : total de ${current.total} barquettes, ${current.sum} détaillées plat par plat.`);
    }
  };
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    if (keys.every((k) => blank(cell(row, k)))) continue;
    const line = i + 1;
    const rawDate = (cell(row, "date") ?? "").trim();
    let date = parseSheetDate(rawDate);
    if (!date && rawDate === "0") {
      // Date vide (« 0 ») : celle de la ligne suivante, quand elle en a une.
      date = parseSheetDate(cell(grid[i + 1], "date"));
      if (date) out.warnings.push(`${name}, ligne ${line} : date vide, celle de la ligne suivante (${shortDate(date)}) est gardée.`);
    } else if (!date && rawDate) {
      out.warnings.push(`${name}, ligne ${line} : date illisible « ${rawDate} », ligne ignorée.`);
      continue;
    }
    date ??= current?.date ?? null;
    if (!date) {
      out.warnings.push(`${name}, ligne ${line} : plat sans date de collecte, ligne ignorée.`);
      continue;
    }
    const total = sumOfNumbers(cell(row, "total"));
    if (!current || current.date !== date) {
      closeCollection();
      current = { date, total, sum: 0 };
    } else if (total != null) current.total = (current.total ?? 0) + total;
    const dishName = text(cell(row, "dish"), 200);
    const trays = parseCount(cell(row, "trays"));
    if (trays == null) {
      out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : nombre de barquettes « ${(cell(row, "trays") ?? "").trim()} » illisible${dishName ? ` pour « ${dishName} »` : ""}, ligne ignorée.`);
      continue;
    }
    if (trays === 0) continue;
    current.sum += trays;
    const lot = text(lotText(cell(row, "lot")), 60);
    const { producedOn, dishCode } = lot ? parseLot(lot) : { producedOn: null, dishCode: null };
    if (lot && /^L\d/i.test(lot) && (!producedOn || !dishCode)) unreadLots++;
    const collected = ["1", "true", "vrai", "oui", "x"].includes(normalize(cell(row, "collected")));
    if (!collected) notCollected++;
    if (!dishName) out.warnings.push(`${name}, ligne ${line} (${shortDate(date)}) : ${trays} barquettes sans nom de plat.`);
    out.entries.push({
      ...base(name, line, date),
      kind: "don",
      trays,
      dishName,
      lot,
      dishCode,
      producedOn,
      bestBefore: parseSheetDate(cell(row, "bestBefore")),
      collected,
    });
  }
  closeCollection();
  if (unreadLots) out.warnings.push(`${unreadLots} n° de lot dont la date de production ou le code plat ne se lisent pas.`);
  if (notCollected) out.warnings.push(`${notCollected} plat${notCollected > 1 ? "s" : ""} sans « Collecté ? » coché (enregistrés comme non collectés).`);
}

// ─── Reconnaissance du fichier ───────────────────────────────────────────────

const yearSheets = (sheets: NamedGrid[], prefix: string) =>
  sheets
    .map((s) => ({ ...s, year: Number(s.name.trim().match(new RegExp(`^${prefix}\\s*(\\d{4})$`, "i"))?.[1] ?? NaN) }))
    .filter((s) => Number.isFinite(s.year));

/** Lit un classeur (onglets déjà extraits) et reconnaît sa source. */
export function parseSurplus(sheets: NamedGrid[]): SurplusParseResult {
  const tgtg = yearSheets(sheets, "TGTG");
  const flash = yearSheets(sheets, "VF");
  const linkee = sheets.filter((s) => locate(s.grid, LINKEE_COLUMNS, ["date", "trays", "dish"]));
  let out: SurplusParseResult;
  if (tgtg.length) {
    out = empty("tgtg", tgtg.map((s) => s.name));
    for (const s of tgtg) parseTgtgSheet(s.name, s.year, s.grid, out);
  } else if (flash.length) {
    out = empty("vente_flash", flash.map((s) => s.name));
    for (const s of flash) parseFlashSheet(s.name, s.year, s.grid, out);
  } else if (linkee.length) {
    out = empty("linkee", [linkee[0]!.name]);
    parseLinkeeSheet(linkee[0]!.name, linkee[0]!.grid, out);
  } else {
    out = empty(null, []);
    out.errors.push("Fichier non reconnu : onglets « TGTG2026 » ou « VF2026 », ou colonne « Date de collecte » (Linkee) attendus.");
    return out;
  }
  const dates = out.entries.map((e) => e.date).sort();
  out.periodFrom = dates[0] ?? null;
  out.periodTo = dates.at(-1) ?? null;
  if (!out.errors.length && !out.entries.length) out.errors.push("Aucune vente ni aucun don dans ce fichier.");
  return out;
}

/** Onglets à lire dans un classeur : ceux des ventes (« TGTG2026 », « VF2026 ») ou, à défaut, tous (Linkee). */
export function sheetsToRead(names: string[]): string[] {
  const wanted = names.filter((n) => /^(TGTG|VF)\s*\d{4}$/i.test(n.trim()));
  return wanted.length ? wanted : names;
}
