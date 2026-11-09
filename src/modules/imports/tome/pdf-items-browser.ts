/**
 * Lecture du tome dans le navigateur : le PDF ne quitte jamais l'ordinateur, seules les données lues sont
 * envoyées au serveur. Le travailleur pdfjs est copié dans `public/` à l'installation (scripts/copy-pdf-worker.mjs).
 */
import { type PdfItem, readPdfItems } from "./pdf-items";

export async function extractPdfItemsInBrowser(data: Uint8Array): Promise<PdfItem[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return readPdfItems(pdfjs.getDocument, data);
}
