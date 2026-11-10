/**
 * Lecture du tome Melba (« Imprimer les recettes ») à partir du texte positionné du PDF.
 *
 * Mise en page reconnue (tailles de police) :
 * - 16,5 : titre — recette (« 2026 S45_VI01-Nom ») ou sous-recette (« Féculent: Tagliatelles (sous recette) ») ;
 * - 12 : rendement (« 1 recette(s) (315.1 g) », « 140 g ») ;
 * - 11,2 et 14,6 : intertitres (« Étapes de production », « Commentaire ») ;
 * - 9,7 : texte libre (étapes, commentaires) — jamais lu : il contient des appréciations et parfois des prénoms ;
 * - 9 : allergènes puis tableau (nom | quantité | unité | coût) ;
 * - 8 : en-tête et pied de page d'impression (date, lien Melba).
 * Les colonnes du tableau se reconnaissent à leur position horizontale. Un nom sur plusieurs lignes est rattaché
 * à la ligne de valeurs la plus proche verticalement (Melba centre les valeurs sur la cellule).
 * Rien n'est deviné : ce qui n'est pas reconnu est signalé dans `anomalies`.
 */
import type { PdfItem } from "./pdf-items";

export interface TomeQuantity {
  quantity: number;
  unit: string;
  cost: number | null;
}

export interface TomeLine extends TomeQuantity {
  label: string;
  /** Nom normalisé, sans la mention « (sous-recette) » : sert à relier une recette à ses sous-recettes. */
  key: string;
  isSubRecipe: boolean;
  /** Poids d'une unité quand Melba l'indique (« Pot (125 g) » → 125). */
  unitWeightG: number | null;
}

export interface TomeRecipe {
  year: number;
  week: number;
  /** Code de la formule : VI01, PJ03, EN01_EQ… */
  code: string;
  name: string;
  /** Poids d'une portion en grammes, quand le rendement l'indique. */
  portionWeightG: number | null;
  /** Nombre de recettes pour lequel le tome est imprimé (1 = une portion) ; quantités et coûts ramenés à une portion. */
  recipeCount: number;
  lines: TomeLine[];
  total: TomeQuantity | null;
  page: number;
}

export interface TomeSubRecipe {
  name: string;
  key: string;
  /** Quantité pour laquelle les ingrédients sont donnés (« 140 g »). */
  reference: { quantity: number; unit: string } | null;
  lines: TomeLine[];
  /** « Recette totale » : poids brut des ingrédients. */
  total: TomeQuantity | null;
  /** « Poids net » : poids après cuisson ou préparation. */
  net: TomeQuantity | null;
  page: number;
}

export interface TomeAnomaly {
  page: number;
  message: string;
}

export interface TomeParseResult {
  recipes: TomeRecipe[];
  subRecipes: TomeSubRecipe[];
  anomalies: TomeAnomaly[];
}

// ─── Mise en page ────────────────────────────────────────────────────────────

/** Fin de la colonne des noms ; plus à gauche quand l'en-tête « Quantité pour » l'est (unités très longues). */
const NAME_COLUMN_MAX_X = 295;
/**
 * Position de la colonne « Unité », lue dans l'en-tête de chaque tableau : elle varie selon la largeur des
 * nombres (tome pour une portion : 372 ; tome pour toute la semaine, avec des quantités comme 307120 g : 348 à
 * 371). Valeur par défaut avant le premier en-tête.
 */
const DEFAULT_UNIT_X = 365;

type LineKind = "title" | "yield" | "heading" | "text" | "table" | "page_furniture";

interface Line {
  page: number;
  y: number;
  items: PdfItem[];
  kind: LineKind;
}

function kindOf(size: number): LineKind {
  if (size <= 8.5) return "page_furniture";
  if (size >= 16) return "title";
  if (size >= 14) return "heading";
  if (size >= 11.8) return "yield";
  if (size >= 10.5) return "heading";
  if (size >= 9.4) return "text";
  return "table";
}

/** Regroupe les morceaux de texte en lignes (même page, même hauteur à 1 point près), de haut en bas. */
function toLines(items: readonly PdfItem[]): Line[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const last = lines.at(-1);
    if (last && last.page === item.page && Math.abs(last.y - item.y) <= 1) {
      last.items.push(item);
    } else {
      lines.push({ page: item.page, y: item.y, items: [item], kind: "table" });
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.kind = kindOf(Math.max(...line.items.map((i) => i.size)));
  }
  return lines;
}

/** Recolle les morceaux d'une ligne ; les ligatures (« Chouti|fl|ette ») sont collées sans espace. */
function joinItems(items: readonly PdfItem[]): string {
  let text = "";
  let end = -Infinity;
  for (const item of items) {
    text += item.x - end < 1 ? item.text : `${text ? " " : ""}${item.text}`;
    end = item.x + item.width;
  }
  return clean(text);
}

const clean = (text: string) =>
  text
    .replace(/[✅✔️]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// ─── Valeurs ─────────────────────────────────────────────────────────────────

const NUMBER = /^-?\d[\d,]*(?:\.\d+)?$/;
const parseNumber = (text: string) => Number(text.replace(/,/g, ""));
const SUB_RECIPE_MARK = /\(\s*sous[\s-]*recettes?\s*\)/i;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** « 2792 recette(s) (312.2 g) » ou « 459.5 portion(s) » → 2792 / 459,5 ; 1 par défaut. */
export function recipeCount(yieldText: string | null | undefined): number {
  const match = yieldText?.match(/^(\d[\d,]*(?:\.\d+)?)\s*(?:recette|portion)/i);
  const n = match ? Number(match[1]!.replace(/,/g, "")) : 1;
  return n > 0 ? n : 1;
}

/** Clé de rapprochement : sans la mention « (sous-recette) », sans accents, ponctuation ni majuscules. */
export function tomeKey(label: string): string {
  return label
    .replace(SUB_RECIPE_MARK, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** « Pot (125 g) » → 125 ; « recette(s) (17.48 g) » → 17.48 ; « 1.5 kg » → 1500. */
export function unitWeightInGrams(unit: string): number | null {
  const match = unit.match(/\((\d+(?:\.\d+)?)\s*(kg|g)\)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2]!.toLowerCase() === "kg" ? value * 1000 : value;
}

interface ValueRow {
  page: number;
  y: number;
  quantity: number | null;
  unit: string;
  cost: number | null;
  fragments: { y: number; text: string }[];
}

function readValues(items: readonly PdfItem[], nameMaxX: number, unitX: number): Omit<ValueRow, "page" | "y" | "fragments"> | null {
  const values = items.filter((i) => i.x >= nameMaxX);
  if (values.length === 0) return null;
  // Le coût est aligné à droite et peut déborder vers la gauche (« 2,911.43 € ») : on le reconnaît à son « € ».
  const isCost = (i: PdfItem) => /€\s*$/.test(i.text);
  const quantityText = joinItems(values.filter((i) => !isCost(i) && i.x < unitX - 2));
  const unit = joinItems(values.filter((i) => !isCost(i) && i.x >= unitX - 2));
  const costText = joinItems(values.filter(isCost));
  if (!NUMBER.test(quantityText)) return null; // en-tête de colonne (« Quantité pour 1 », « recette(s) », « g »)
  const cost = costText.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*€$/);
  return { quantity: parseNumber(quantityText), unit, cost: cost ? parseNumber(cost[1]!) : null };
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

const RECIPE_TITLE = /^(\d{4})\s*S(\d{1,2})_([A-Z]{2,3}\d{2,3}(?:_[A-Z]{2,3})?)\s*-\s*(.+)$/;

interface Section {
  title: string;
  page: number;
  yieldText: string | null;
  rows: ValueRow[];
}

export function parseTome(items: readonly PdfItem[]): TomeParseResult {
  const anomalies: TomeAnomaly[] = [];
  const sections: Section[] = [];
  let section: Section | null = null;
  let inTable = false;
  let unitX = DEFAULT_UNIT_X;
  let nameMaxX = NAME_COLUMN_MAX_X;
  let quantityHeaderX: number | null = null;
  let titleOpen = false;
  /** Lignes de la portion de tableau en cours (une page) : valeurs et morceaux de nom. */
  let pending: { values: ValueRow[]; names: { y: number; text: string }[] } = { values: [], names: [] };

  const flushTable = () => {
    const { values, names } = pending;
    if (names.length && values.length === 0 && section) {
      anomalies.push({ page: section.page, message: `Texte sans quantité dans « ${section.title} » : ${names.map((n) => n.text).join(" ")}` });
    }
    for (const name of names) {
      if (!values.length) break;
      const nearest = values.reduce((best, row) => (Math.abs(row.y - name.y) < Math.abs(best.y - name.y) ? row : best));
      nearest.fragments.push(name);
    }
    pending = { values: [], names: [] };
  };

  for (const line of toLines(items)) {
    if (line.kind === "page_furniture") continue;
    if (line.kind !== "title") titleOpen = false;

    switch (line.kind) {
      case "title": {
        flushTable();
        const text = joinItems(line.items);
        if (titleOpen && section) {
          section.title = `${section.title} ${text}`;
        } else {
          section = { title: text, page: line.page, yieldText: null, rows: [] };
          sections.push(section);
          inTable = false;
        }
        titleOpen = true;
        break;
      }
      case "yield":
        if (section && section.yieldText == null) section.yieldText = joinItems(line.items);
        break;
      case "heading":
        flushTable();
        inTable = false;
        break;
      case "text":
        break;
      case "table": {
        if (!section) break;
        const text = joinItems(line.items);
        // « Quantité pour 722 » (au-dessus de l'en-tête) : début de la colonne des quantités.
        if (/^Quantité pour\b/.test(joinItems(line.items.filter((i) => i.x > 150)))) {
          quantityHeaderX = line.items.find((i) => /^Quantité pour/.test(i.text.trim()))?.x ?? null;
        }
        if (/^Ingrédients\b/.test(joinItems(line.items.filter((i) => i.x < 150)))) {
          // En-tête de tableau, répété en haut de chaque page : il donne la position de la colonne « Unité ».
          if (pending.values.length && pending.values[0]!.page !== line.page) flushTable();
          inTable = true;
          unitX = line.items.find((i) => /^Unité$/.test(i.text.trim()))?.x ?? DEFAULT_UNIT_X;
          nameMaxX = quantityHeaderX != null ? Math.min(NAME_COLUMN_MAX_X, quantityHeaderX + 10) : NAME_COLUMN_MAX_X;
          break;
        }
        if (!inTable) break; // allergènes
        // En-tête de colonne répété en haut de page (« Quantité pour 1 », « recette(s) », « g »).
        if (line.items.every((i) => i.x >= 240 && i.x < unitX - 2) || /^Quantité pour\b/.test(text)) break;
        // Consigne glissée dans la liste des ingrédients (« saupoudrer de parmesan | - | 0.00 € ») : pas une quantité.
        if (joinItems(line.items.filter((i) => i.x >= nameMaxX && i.x < unitX - 2)) === "-") break;
        if (pending.values.length && pending.values[0]!.page !== line.page) flushTable();
        const values = readValues(line.items, nameMaxX, unitX);
        const nameText = joinItems(line.items.filter((i) => i.x < nameMaxX));
        if (values) {
          const row: ValueRow = { page: line.page, y: line.y, ...values, fragments: nameText ? [{ y: line.y, text: nameText }] : [] };
          pending.values.push(row);
          section.rows.push(row);
        } else if (nameText && line.items.every((i) => i.x < nameMaxX)) {
          pending.names.push({ y: line.y, text: nameText });
        } else if (!/^(Quantité pour|recette\(s\)|g|kg|portion)/i.test(text)) {
          anomalies.push({ page: line.page, message: `Ligne non reconnue : ${text}` });
        }
        break;
      }
    }
  }
  flushTable();

  return assemble(sections, anomalies);
}

function toTomeLine(row: ValueRow): TomeLine {
  const label = clean(
    row.fragments
      .sort((a, b) => b.y - a.y)
      .map((f) => f.text)
      .join(" ")
      .replace(/- (?=[a-zà-ÿ])/g, "-"),
  );
  return {
    label,
    key: tomeKey(label),
    isSubRecipe: SUB_RECIPE_MARK.test(label),
    quantity: row.quantity!,
    unit: row.unit,
    unitWeightG: unitWeightInGrams(row.unit),
    cost: row.cost,
  };
}

function assemble(sections: Section[], anomalies: TomeAnomaly[]): TomeParseResult {
  const recipes: TomeRecipe[] = [];
  const subRecipes = new Map<string, TomeSubRecipe>();

  for (const section of sections) {
    const lines: TomeLine[] = [];
    let total: TomeQuantity | null = null;
    let net: TomeQuantity | null = null;
    for (const row of section.rows) {
      const line = toTomeLine(row);
      if (!line.label) {
        anomalies.push({ page: row.page, message: `Quantité sans nom dans « ${section.title} »` });
      } else if (/^Recette totale$/i.test(line.label)) {
        total = { quantity: line.quantity, unit: line.unit, cost: line.cost };
      } else if (/^Poids net$/i.test(line.label)) {
        net = { quantity: line.quantity, unit: line.unit, cost: line.cost };
      } else {
        lines.push(line);
      }
    }
    if (lines.length === 0) anomalies.push({ page: section.page, message: `Aucun ingrédient lu pour « ${section.title} »` });
    if (!total) anomalies.push({ page: section.page, message: `« Recette totale » absente pour « ${section.title} »` });

    const recipe = section.title.match(RECIPE_TITLE);
    if (recipe) {
      // Le tome peut être imprimé pour une portion (« 1 recette(s) (315.1 g) ») ou pour toute la production de la
      // semaine (« 2792 recette(s) (312.2 g) ») : quantités et coûts sont toujours ramenés à une portion.
      const count = recipeCount(section.yieldText);
      const perPortion = <T extends { quantity: number; cost: number | null }>(q: T): T =>
        count === 1 ? q : { ...q, quantity: round4(q.quantity / count), cost: q.cost != null ? round4(q.cost / count) : null };
      recipes.push({
        year: Number(recipe[1]),
        week: Number(recipe[2]),
        code: recipe[3]!,
        name: clean(recipe[4]!),
        portionWeightG: section.yieldText?.match(/\((\d+(?:\.\d+)?)\s*g\)/)?.[1] ? Number(section.yieldText.match(/\((\d+(?:\.\d+)?)\s*g\)/)![1]) : null,
        recipeCount: count,
        lines: lines.map(perPortion),
        total: total ? perPortion(total) : null,
        page: section.page,
      });
      continue;
    }

    const key = tomeKey(section.title);
    const reference = section.yieldText?.match(/^(\d+(?:\.\d+)?)\s*(\S.*)$/);
    const subRecipe: TomeSubRecipe = {
      name: clean(section.title.replace(SUB_RECIPE_MARK, " ")),
      key,
      reference: reference ? { quantity: Number(reference[1]), unit: reference[2]! } : null,
      lines,
      total,
      net,
      page: section.page,
    };
    const existing = subRecipes.get(key);
    if (!existing) {
      subRecipes.set(key, subRecipe);
    } else if (JSON.stringify([existing.lines, existing.total, existing.net]) !== JSON.stringify([subRecipe.lines, subRecipe.total, subRecipe.net])) {
      anomalies.push({ page: section.page, message: `Sous-recette « ${subRecipe.name} » imprimée deux fois avec des contenus différents (pages ${existing.page} et ${section.page})` });
    }
  }

  // Chaque sous-recette utilisée doit être détaillée dans le tome.
  for (const owner of [...recipes, ...subRecipes.values()]) {
    for (const line of owner.lines) {
      if (line.isSubRecipe && !subRecipes.has(line.key)) {
        anomalies.push({ page: owner.page, message: `Sous-recette « ${line.label} » utilisée mais non détaillée dans le tome` });
      }
    }
  }
  // Contrôle de lecture : la somme des coûts des lignes doit redonner le coût total.
  for (const owner of [...recipes, ...subRecipes.values()]) {
    if (owner.total?.cost == null || owner.lines.some((l) => l.cost == null)) continue;
    const sum = owner.lines.reduce((s, l) => s + l.cost!, 0);
    if (Math.abs(sum - owner.total.cost) > 0.02 + 0.006 * owner.lines.length) {
      const name = "code" in owner ? `${owner.code} – ${owner.name}` : owner.name;
      anomalies.push({ page: owner.page, message: `Coûts incohérents pour « ${name} » : lignes ${sum.toFixed(2)} € / total ${owner.total.cost.toFixed(2)} €` });
    }
  }

  return { recipes, subRecipes: [...subRecipes.values()], anomalies };
}
