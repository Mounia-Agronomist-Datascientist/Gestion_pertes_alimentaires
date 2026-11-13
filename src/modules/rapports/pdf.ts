/**
 * Petite mise en page PDF des rapports (docs/PHASE5.md, étape 5.7) : A4 portrait, en-tête et pied de page sur
 * chaque page, titres, paragraphes, chiffres clés, tableaux (repris sur la page suivante avec leurs titres de
 * colonnes) et barres horizontales. Polices standard du PDF (Helvetica) : aucun fichier de police à charger.
 */
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 42;
/** Hauteur d'une ligne de tableau. */
export const ROW_HEIGHT = 15;
const CONTENT_WIDTH = A4.width - 2 * MARGIN;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.4, 0.45, 0.52);
const LINE = rgb(0.85, 0.87, 0.9);
const ZEBRA = rgb(0.96, 0.97, 0.98);
const ACCENT = rgb(0.06, 0.46, 0.43);
const BAR = rgb(0.06, 0.46, 0.43);
const BAR_TRACK = rgb(0.93, 0.95, 0.96);

/**
 * Texte compatible avec l'encodage des polices standard (WinAnsi) : espaces insécables fines des nombres
 * français remplacées, signe moins et flèches convertis, emoji et autres caractères retirés.
 */
export function pdfText(text: string): string {
  return text
    .replace(/[  ]/g, " ")
    .replace(/−/g, "-")
    .replace(/[→⟶]/g, "->")
    .replace(/[▲]/g, "+")
    .replace(/[▼]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[^ -~ -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export interface Column {
  header: string;
  /** Part de la largeur (les parts sont normalisées). */
  width: number;
  align?: "left" | "right";
}

export class ReportPdf {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  private y = 0;

  private constructor(
    private readonly title: string,
    private readonly subtitle: string,
    private readonly generatedAt: string,
  ) {}

  static async create(title: string, subtitle: string, generatedAt: string) {
    const r = new ReportPdf(title, subtitle, generatedAt);
    r.doc = await PDFDocument.create();
    r.doc.setTitle(pdfText(`${title} — ${subtitle}`));
    r.doc.setAuthor("La Brigade de Véro — Suivi des pertes");
    r.doc.setCreator("Pertes");
    r.font = await r.doc.embedFont(StandardFonts.Helvetica);
    r.bold = await r.doc.embedFont(StandardFonts.HelveticaBold);
    r.newPage();
    return r;
  }

  private newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    const top = A4.height - MARGIN;
    this.page.drawText("La Brigade de Véro — Suivi des pertes", { x: MARGIN, y: top, size: 8, font: this.font, color: MUTED });
    const right = pdfText(`${this.title} · ${this.subtitle}`);
    this.page.drawText(right, { x: A4.width - MARGIN - this.font.widthOfTextAtSize(right, 8), y: top, size: 8, font: this.font, color: MUTED });
    this.page.drawLine({ start: { x: MARGIN, y: top - 6 }, end: { x: A4.width - MARGIN, y: top - 6 }, thickness: 0.5, color: LINE });
    this.y = top - 24;
  }

  /** Passe à la page suivante si la hauteur demandée ne tient plus. */
  private ensure(height: number) {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of pdfText(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Coupe un texte trop long pour une cellule, avec des points de suspension. */
  private fit(text: string, font: PDFFont, size: number, width: number): string {
    let t = pdfText(text);
    if (font.widthOfTextAtSize(t, size) <= width) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  /** Titre de section ; `following` : hauteur du bloc qui suit, gardé sur la même page quand il tient sur une page. */
  heading(text: string, following = 40) {
    this.ensure(Math.min(following, A4.height - 2 * MARGIN - 80) + 30);
    this.y -= 10;
    this.page.drawText(pdfText(text), { x: MARGIN, y: this.y, size: 13, font: this.bold, color: ACCENT });
    this.y -= 18;
  }

  /** Titre principal de la première page. */
  cover(lead: string) {
    this.page.drawText(pdfText(this.title), { x: MARGIN, y: this.y, size: 20, font: this.bold, color: INK });
    this.y -= 22;
    this.page.drawText(pdfText(this.subtitle), { x: MARGIN, y: this.y, size: 12, font: this.font, color: INK });
    this.y -= 16;
    this.paragraph(`${lead} Rapport produit le ${this.generatedAt}.`, { muted: true, size: 9 });
    this.y -= 4;
  }

  paragraph(text: string, options: { muted?: boolean; size?: number } = {}) {
    const size = options.size ?? 10;
    for (const line of this.wrap(text, this.font, size, CONTENT_WIDTH)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.font, color: options.muted ? MUTED : INK });
      this.y -= size + 4;
    }
    this.y -= 4;
  }

  bullets(items: string[]) {
    for (const item of items) {
      const lines = this.wrap(item, this.font, 10, CONTENT_WIDTH - 12);
      lines.forEach((line, i) => {
        this.ensure(14);
        if (i === 0) this.page.drawText("•", { x: MARGIN, y: this.y, size: 10, font: this.font, color: INK });
        this.page.drawText(line, { x: MARGIN + 12, y: this.y, size: 10, font: this.font, color: INK });
        this.y -= 14;
      });
    }
    this.y -= 4;
  }

  /** Chiffres clés : cases de même largeur, quatre par ligne. */
  figures(items: { label: string; value: string; note?: string | null }[]) {
    const perRow = 4;
    const gap = 8;
    const width = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
    const height = 54;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(height + gap);
      items.slice(i, i + perRow).forEach((item, j) => {
        const x = MARGIN + j * (width + gap);
        const top = this.y;
        this.page.drawRectangle({ x, y: top - height, width, height, color: ZEBRA, borderColor: LINE, borderWidth: 0.5 });
        this.page.drawText(this.fit(item.label, this.font, 8, width - 12), { x: x + 6, y: top - 13, size: 8, font: this.font, color: MUTED });
        this.page.drawText(this.fit(item.value, this.bold, 13, width - 12), { x: x + 6, y: top - 31, size: 13, font: this.bold, color: INK });
        if (item.note) this.page.drawText(this.fit(item.note, this.font, 7.5, width - 12), { x: x + 6, y: top - 45, size: 7.5, font: this.font, color: MUTED });
      });
      this.y -= height + gap;
    }
    this.y -= 4;
  }

  table(columns: Column[], rows: string[][], options: { total?: string[] } = {}) {
    const totalWidth = columns.reduce((a, c) => a + c.width, 0);
    const widths = columns.map((c) => (c.width / totalWidth) * CONTENT_WIDTH);
    const size = 8.5;
    const rowHeight = ROW_HEIGHT;
    const drawRow = (cells: string[], font: PDFFont, background: ReturnType<typeof rgb> | null, color = INK) => {
      this.ensure(rowHeight);
      if (background) this.page.drawRectangle({ x: MARGIN, y: this.y - rowHeight + 4, width: CONTENT_WIDTH, height: rowHeight, color: background });
      let x = MARGIN;
      cells.forEach((cell, i) => {
        const w = widths[i]!;
        const text = this.fit(cell ?? "", font, size, w - 8);
        const tx = columns[i]!.align === "right" ? x + w - 4 - font.widthOfTextAtSize(text, size) : x + 4;
        this.page.drawText(text, { x: tx, y: this.y - 7, size, font, color });
        x += w;
      });
      this.y -= rowHeight;
    };
    const header = () => {
      drawRow(
        columns.map((c) => c.header),
        this.bold,
        null,
        MUTED,
      );
      this.page.drawLine({ start: { x: MARGIN, y: this.y + 4 }, end: { x: MARGIN + CONTENT_WIDTH, y: this.y + 4 }, thickness: 0.5, color: LINE });
    };
    // Un tableau qui tient sur une page n'est pas coupé.
    const whole = (rows.length + (options.total ? 2 : 1)) * rowHeight + 8;
    this.ensure(whole <= A4.height - 2 * MARGIN - 60 ? whole : rowHeight * 3);
    header();
    rows.forEach((row, i) => {
      if (this.y - rowHeight < MARGIN + 20) {
        this.newPage();
        header();
      }
      drawRow(row, this.font, i % 2 ? ZEBRA : null);
    });
    if (options.total) {
      this.page.drawLine({ start: { x: MARGIN, y: this.y + 4 }, end: { x: MARGIN + CONTENT_WIDTH, y: this.y + 4 }, thickness: 0.8, color: INK });
      drawRow(options.total, this.bold, null);
    }
    this.y -= 8;
  }

  /** Barres horizontales d'une seule couleur, valeur écrite (jamais l'information par la seule barre). */
  bars(rows: { label: string; value: number; text: string; detail?: string | null }[]) {
    const max = Math.max(0, ...rows.map((r) => r.value));
    const labelWidth = CONTENT_WIDTH * 0.42;
    const valueWidth = 90;
    const barWidth = CONTENT_WIDTH - labelWidth - valueWidth - 12;
    for (const r of rows) {
      const height = r.detail ? 24 : 16;
      this.ensure(height);
      this.page.drawText(this.fit(r.label, this.font, 9, labelWidth - 6), { x: MARGIN, y: this.y - 8, size: 9, font: this.font, color: INK });
      if (r.detail) this.page.drawText(this.fit(r.detail, this.font, 7.5, labelWidth - 6), { x: MARGIN, y: this.y - 18, size: 7.5, font: this.font, color: MUTED });
      const bx = MARGIN + labelWidth;
      this.page.drawRectangle({ x: bx, y: this.y - 10, width: barWidth, height: 7, color: BAR_TRACK });
      if (r.value > 0 && max > 0) this.page.drawRectangle({ x: bx, y: this.y - 10, width: Math.max(1, (r.value / max) * barWidth), height: 7, color: BAR });
      const text = pdfText(r.text);
      this.page.drawText(text, { x: MARGIN + CONTENT_WIDTH - this.bold.widthOfTextAtSize(text, 9), y: this.y - 9, size: 9, font: this.bold, color: INK });
      this.y -= height;
    }
    this.y -= 6;
  }

  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const text = `Page ${i + 1} / ${pages.length}`;
      page.drawText(text, { x: A4.width - MARGIN - this.font.widthOfTextAtSize(text, 8), y: MARGIN - 14, size: 8, font: this.font, color: MUTED });
    });
    return this.doc.save();
  }
}
