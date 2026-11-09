/**
 * Extraction du texte positionné d'un PDF (tome Melba) avec pdfjs-dist.
 * Seules les informations utiles à la lecture du tome sont gardées : page, position, largeur, taille de police.
 * `extractPdfItems` s'exécute côté serveur (scripts, tests) ; l'écran d'import lit le PDF dans le navigateur
 * (`pdf-items-browser.ts`) pour ne jamais envoyer le fichier.
 */
import type { getDocument as GetDocument } from "pdfjs-dist";

export interface PdfItem {
  page: number;
  /** Abscisse du début du texte, en points depuis la gauche. */
  x: number;
  /** Ordonnée de la ligne de base, en points depuis le bas de la page. */
  y: number;
  width: number;
  /** Taille de police : distingue titres, tableaux, commentaires. */
  size: number;
  text: string;
}

const round = (n: number, step = 0.5) => Math.round(n / step) * step;

/** Lit toutes les pages avec la version de pdfjs fournie (navigateur ou Node). */
export async function readPdfItems(getDocument: typeof GetDocument, data: Uint8Array): Promise<PdfItem[]> {
  const task = getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const items: PdfItem[] = [];
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        items.push({
          page,
          x: round(item.transform[4]),
          y: round(item.transform[5]),
          width: round(item.width),
          size: round(item.height, 0.1),
          text: item.str,
        });
      }
    }
  } finally {
    await task.destroy();
  }
  return items;
}

/** Côté serveur (Node) : version « legacy » de pdfjs, sans travailleur séparé. */
export async function extractPdfItems(data: Uint8Array): Promise<PdfItem[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return readPdfItems(getDocument as typeof GetDocument, data);
}
