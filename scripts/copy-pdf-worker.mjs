// Copie le travailleur de pdfjs-dist dans public/ (lecture du tome Melba dans le navigateur, écran d'import).
// Lancé automatiquement après `npm install` / `npm ci` : la copie suit toujours la version installée.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
