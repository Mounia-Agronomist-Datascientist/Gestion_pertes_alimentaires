/**
 * Lecture d'un bon de commande Melba (PDF), docs/PHASE6.md étape 6.8. Même mise en page pour tous les fournisseurs :
 * en-tête (numéro, fournisseur, objet, date de livraison), puis un tableau Désignation · Code fournisseur ·
 * Catégorie · Qté · Conditionnement · Prix unitaire HT · Total HT. Les colonnes sont retrouvées d'après l'en-tête
 * du tableau (leur position varie d'un bon à l'autre) ; chaque ligne commence par sa quantité.
 * Les adresses e-mail (interlocuteurs) ne sont jamais gardées.
 */
import type { PdfItem } from "../tome/pdf-items";

export interface PurchasePackaging {
  /** Libellé du conditionnement, ex. « Sachet 5kg ». */
  label: string;
  /** Contenance lue entre parenthèses, ex. 5 et « kg », 20 et « Merguez » ; null si absente. */
  contentQuantity: number | null;
  contentUnit: string | null;
}

export interface PurchaseLine {
  position: number;
  designation: string;
  supplierCode: string | null;
  category: string | null;
  quantity: number;
  packaging: PurchasePackaging | null;
  unitPriceEur: number;
  /** Ce que le prix unitaire paie : « kg », « Carton », « Bouteille 64cl »… */
  priceUnit: string;
  totalEur: number | null;
}

export interface ParsedPurchaseOrder {
  fileName: string;
  number: string;
  /** Fournisseur du nom du fichier (noms des dossiers du Drive), à défaut celui de l'en-tête. */
  supplier: string;
  /** Fournisseur tel qu'écrit dans l'en-tête par Melba (« Pro à Pro (Neg) »). */
  supplierLabel: string;
  /** Objet sans le numéro, ex. « S47 Camion A ». */
  subject: string | null;
  /** Semaine de production : celle du nom du fichier, à défaut celle de l'objet. */
  week: number | null;
  deliveryDate: string;
  /** Date de création du bon : les 8 premiers chiffres du numéro (AAAAMMJJ). */
  orderedOn: string | null;
  totalEur: number | null;
  lines: PurchaseLine[];
  warnings: string[];
}

export type PurchaseOrderParse =
  { ok: true; order: ParsedPurchaseOrder } | { ok: false; fileName: string; error: string };

const EMAIL = /\S+@\S+/;
const clean = (t: string) =>
  t
    .replace(/[\u0000-\u001f -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** « 1,000.00 » → 1000 ; « 2,110.60 € » → 2110.6. */
export const parseAmount = (t: string): number | null => {
  const m = clean(t).match(/^(-?\d[\d,]*(?:\.\d+)?)/);
  return m ? Number(m[1]!.replace(/,/g, "")) : null;
};
const frenchDate = (t: string) => {
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** « Sachet 5kg (5.00 kg) », « Barquette (20.00 Merguez) », « kg » (sans contenance). */
export function parsePackaging(text: string): PurchasePackaging | null {
  const t = clean(text);
  if (!t) return null;
  const m = t.match(/^(.*?)\s*\((\d[\d,]*(?:\.\d+)?)\s*([^()]*)\)$/);
  if (!m)
    return { label: t, contentQuantity: /^kgs?$/i.test(t) ? 1 : null, contentUnit: /^kgs?$/i.test(t) ? "kg" : null };
  // « Sachet 5kg) (5.00 kg) » : parenthèse orpheline tapée dans Melba.
  const raw = m[1]!.trim();
  const label = (raw.split(")").length > raw.split("(").length ? raw.replace(/\)\s*$/, "").trim() : raw) || t;
  return { label, contentQuantity: Number(m[2]!.replace(/,/g, "")), contentUnit: m[3]!.trim() || null };
}

interface Column {
  key: "designation" | "code" | "category" | "quantity" | "packaging" | "price" | "total";
  left: number;
  right: number;
}

/** Colonnes d'après l'en-tête du tableau d'une page ; null si la page n'en a pas. */
function headerColumns(items: readonly PdfItem[]): { columns: Column[]; y: number } | null {
  const find = (re: RegExp) => items.find((i) => re.test(clean(i.text)));
  const designation = find(/^Désignation$/i);
  if (!designation) return null;
  // En-tête sur une à trois lignes (« Prix / unitaire / HT »).
  const near = items.filter((i) => Math.abs(i.y - designation.y) <= 13);
  const at = (re: RegExp) => near.find((i) => re.test(clean(i.text)));
  const code = at(/^Code$/i);
  const category = at(/^Catégorie$/i);
  const quantity = at(/^Qté$/i);
  const packaging = at(/^Conditionnement$/i);
  const total = at(/^Total HT$/i);
  // « Prix unitaire HT » : en un ou plusieurs morceaux ; son bord droit est celui du morceau le plus à droite avant « Total HT ».
  const priceParts = near.filter((i) => /prix|unitaire|^HT$/i.test(clean(i.text)) && (!total || i.x < total.x));
  if (!code || !category || !quantity || !packaging || !total || !priceParts.length) return null;
  const r = (i: PdfItem) => i.x + i.width;
  return {
    y: Math.min(...near.map((i) => i.y)),
    columns: [
      { key: "designation", left: designation.x, right: designation.x },
      { key: "code", left: code.x, right: code.x },
      { key: "category", left: category.x, right: category.x },
      { key: "quantity", left: quantity.x, right: r(quantity) },
      { key: "packaging", left: packaging.x, right: r(packaging) },
      { key: "price", left: Math.min(...priceParts.map((p) => p.x)), right: Math.max(...priceParts.map(r)) },
      { key: "total", left: total.x, right: r(total) },
    ],
  };
}

const TOLERANCE = 3;

/** Colonne d'un élément du tableau : texte aligné à gauche (désignation, code, catégorie) ou à droite (le reste). */
function columnOf(item: PdfItem, columns: readonly Column[]): Column["key"] | null {
  const right = item.x + item.width;
  for (const c of columns) {
    if (["quantity", "packaging", "price", "total"].includes(c.key) && Math.abs(right - c.right) <= TOLERANCE)
      return c.key;
  }
  for (const c of columns) {
    if (["designation", "code", "category"].includes(c.key) && Math.abs(item.x - c.left) <= TOLERANCE) return c.key;
  }
  // Dernière chance : la colonne dont le début est juste avant l'élément (texte mal aligné).
  const before = [...columns].filter((c) => c.left <= item.x + TOLERANCE).sort((a, b) => b.left - a.left)[0];
  return before?.key ?? null;
}

/** Morceaux d'une même cellule : lignes successives d'une colonne, espacées de moins de 13 points. */
function cellBlocks(items: PdfItem[]) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const blocks: PdfItem[][] = [];
  for (const item of sorted) {
    const last = blocks.at(-1);
    if (last && last.at(-1)!.y - item.y <= 13) last.push(item);
    else blocks.push([item]);
  }
  return blocks.map((b) => ({ y: (b[0]!.y + b.at(-1)!.y) / 2, text: clean(b.map((i) => i.text).join(" ")) }));
}

/** « 20261110_Pro à Pro_S47_BC 20261104019.pdf » → « Pro à Pro ». */
const supplierOfFileName = (fileName: string) =>
  fileName
    .replace(/^.*\//, "")
    .match(/^\d{8}_(.+?)_S\d{1,2}_BC\b/i)?.[1]
    ?.trim() || null;

/** « S47 » dans le nom du fichier (« 20261110_APO_S47_BC 20261104036.pdf »), à défaut dans l'objet. */
const weekOf = (fileName: string, subject: string | null) => {
  const m = fileName.match(/_S(\d{1,2})_/i) ?? subject?.match(/\bS\s?(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
};

export function parsePurchaseOrder(fileName: string, allItems: readonly PdfItem[]): PurchaseOrderParse {
  const fail = (error: string): PurchaseOrderParse => ({ ok: false, fileName, error });
  const items = allItems.filter((i) => clean(i.text));
  const page1 = items.filter((i) => i.page === 1);
  const titleIndex = page1.findIndex((i) => /^Bon de commande/i.test(clean(i.text)));
  if (titleIndex < 0) return fail("Ce PDF n'est pas un bon de commande Melba (titre « Bon de commande N° » absent)");
  const title = page1[titleIndex]!;
  const number =
    clean(title.text).match(/(\d{8,})/)?.[1] ?? page1.map((i) => clean(i.text)).find((t) => /^\d{8,}$/.test(t));
  if (!number) return fail("Numéro du bon de commande introuvable");

  const objectItem = page1.find((i) => /^Objet\s*:/i.test(clean(i.text)));
  const deliveryItem = page1.find((i) => /^Date de livraison/i.test(clean(i.text)));
  const deliveryDate = deliveryItem ? frenchDate(clean(deliveryItem.text)) : null;
  if (!deliveryDate) return fail("Date de livraison introuvable");
  const subject = objectItem
    ? clean(
        clean(objectItem.text)
          .replace(/^Objet\s*:\s*/i, "")
          .replace(number, ""),
      )
        .replace(/^\(\s*|\s*\)$/g, "")
        .trim() || null
    : null;

  // Fournisseur : bloc de droite sous le titre, jusqu'à son adresse e-mail (jamais gardée). Les anciens bons
  // portent aussi la date (« Le 26 févr. 26 »), en plus gros.
  const top = objectItem?.y ?? deliveryItem!.y;
  const supplierParts: string[] = [];
  for (const i of page1
    .filter(
      (p) =>
        p.x >= 300 &&
        p.y > top &&
        p.y < title.y - 5 &&
        p.size <= title.size * 0.6 &&
        !/^\d{8,}$/.test(clean(p.text)) &&
        !/^Le \d/.test(clean(p.text)),
    )
    .sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (EMAIL.test(i.text)) break;
    supplierParts.push(clean(i.text));
  }
  const supplierLabel = supplierParts.join(" ").trim();
  const supplier = supplierOfFileName(fileName) ?? supplierLabel;
  if (!supplier) return fail("Fournisseur introuvable dans l'en-tête");

  const warnings: string[] = [];
  const lines: PurchaseLine[] = [];
  let columns: Column[] | null = null;
  let totalEur: number | null = null;
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const pageItems = items.filter((i) => i.page === page && !EMAIL.test(i.text));
    const header = headerColumns(pageItems);
    if (header) columns = header.columns;
    if (!columns) continue;
    const footer = pageItems.find((i) => /^Total HT$/i.test(clean(i.text)) && (!header || i.y < header.y - 5));
    if (footer) {
      const amount = pageItems.find((i) => Math.abs(i.y - footer.y) <= 3 && i.x > footer.x && /€/.test(i.text));
      totalEur = amount ? parseAmount(amount.text) : null;
    }
    const tableItems = pageItems.filter(
      (i) => (header ? i.y < header.y - 2 : i.y < title.y) && (!footer || i.y > footer.y + 3),
    );
    const byColumn = new Map<Column["key"], PdfItem[]>();
    for (const i of tableItems) {
      const key = columnOf(i, columns);
      if (key) byColumn.set(key, [...(byColumn.get(key) ?? []), i]);
    }
    // Une ligne par quantité ; chaque cellule va à la quantité la plus proche en hauteur.
    const anchors = (byColumn.get("quantity") ?? [])
      .filter((i) => parseAmount(i.text) != null)
      .sort((a, b) => b.y - a.y);
    if (!anchors.length) continue;
    const cells = new Map<Column["key"], { y: number; text: string }[][]>();
    for (const key of ["designation", "code", "category", "packaging", "price", "total"] as const) {
      const slots: { y: number; text: string }[][] = anchors.map(() => []);
      for (const block of cellBlocks(byColumn.get(key) ?? [])) {
        let best = 0;
        anchors.forEach((a, idx) => {
          if (Math.abs(a.y - block.y) < Math.abs(anchors[best]!.y - block.y)) best = idx;
        });
        slots[best]!.push(block);
      }
      cells.set(key, slots);
    }
    const text = (key: Column["key"], idx: number) =>
      clean(
        cells
          .get(key)!
          [idx]!.map((b) => b.text)
          .join(" "),
      );
    anchors.forEach((anchor, idx) => {
      const position = lines.length + 1;
      const designation = text("designation", idx);
      const priceText = text("price", idx);
      const price = priceText.match(/^(\d[\d,]*(?:\.\d+)?)\s*€\s*\/\s*(.+)$/);
      if (!designation || !price) {
        warnings.push(`Ligne ${position} illisible (${designation || "désignation absente"}) : ignorée`);
        return;
      }
      lines.push({
        position,
        designation,
        supplierCode: text("code", idx) || null,
        category: text("category", idx) || null,
        quantity: parseAmount(anchor.text)!,
        packaging: parsePackaging(text("packaging", idx)),
        unitPriceEur: Number(price[1]!.replace(/,/g, "")),
        priceUnit: clean(price[2]!),
        totalEur: parseAmount(text("total", idx)),
      });
    });
  }
  if (!columns) return fail("Tableau des produits introuvable (en-tête « Désignation … Total HT » absent)");
  if (!lines.length) return fail("Aucune ligne de produit lue");
  const sum = lines.reduce((acc, l) => acc + (l.totalEur ?? 0), 0);
  if (totalEur != null && Math.abs(sum - totalEur) > 0.05) {
    warnings.push(
      `Total des lignes (${sum.toFixed(2)} €) différent du total du bon (${totalEur.toFixed(2)} €) : une ligne a pu être mal lue`,
    );
  }
  const orderedOn = /^(\d{4})(\d{2})(\d{2})/.exec(number);
  return {
    ok: true,
    order: {
      fileName,
      number,
      supplier,
      supplierLabel,
      subject,
      week: weekOf(fileName, subject),
      deliveryDate,
      orderedOn: orderedOn ? `${orderedOn[1]}-${orderedOn[2]}-${orderedOn[3]}` : null,
      totalEur,
      lines,
      warnings,
    },
  };
}
