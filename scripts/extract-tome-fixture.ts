// Prépare un extrait de test à partir d'un tome Melba (PDF) : texte positionné des titres, rendements et
// tableaux uniquement. Les en-têtes et pieds de page (date, lien Melba) et le texte libre (étapes, commentaires,
// qui peuvent contenir des prénoms) sont retirés.
// Usage : npx tsx scripts/extract-tome-fixture.ts <tome.pdf> <sortie.json>
import { readFileSync, writeFileSync } from "node:fs";
import { extractPdfItems } from "../src/modules/imports/tome/pdf-items";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage : npx tsx scripts/extract-tome-fixture.ts <tome.pdf> <sortie.json>");
const items = (await extractPdfItems(new Uint8Array(readFileSync(input)))).filter((i) => i.size > 8.5 && !(i.size >= 9.4 && i.size < 10.5));
const rows = items.map((i) => [i.page, i.x, i.y, i.width, i.size, i.text]);
writeFileSync(output, `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
console.log(`${rows.length} morceaux de texte écrits dans ${output}`);
