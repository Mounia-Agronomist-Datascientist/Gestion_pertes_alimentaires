import { describe, expect, it } from "vitest";
import { decompteWeeks, parseCount, parseDecompte } from "@/modules/imports/decompte/parse-decompte";

// Extrait anonymisé de la forme de l'onglet « Semaine 45 » (codes et nombres seulement).
const header = ["", "", "Décompte à copier dans A", "Décompte à copier dans B", "API vendredi", "", "", "", "", "E", "", "", "", "", "A", "B", "C", "D", "E", "Ma production", "API totale"];
const row = (code: string, days: number[], made: string) => [code, "2953", "", "", "", "", "", "", "", "", "", "", "", code, ...days.map(String), made, ""];
const grid = [
  header,
  row("VI01", [605, 605, 601, 590, 537], "2938"),
  row("PJ12", [141, 141, 118, 130, 130], "660"),
  [],
  ["PROD 5"],
  ["2833", "105", "103,70%", "", "VI01", "2925"],
];

describe("lecture du Décompte barquettes", () => {
  it("lit « Ma production » par code dans le premier tableau seulement", () => {
    const r = parseDecompte(grid);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.code, x.made])).toEqual([
      ["VI01", 2938],
      ["PJ12", 660],
    ]);
  });

  it("refuse un onglet sans « Ma production » et signale les doublons", () => {
    expect(parseDecompte([["VI01", "12"]]).errors[0]).toMatch(/Ma production/);
    expect(parseDecompte([header, row("VI01", [1, 1, 1, 1, 1], "5"), row("VI01", [1, 1, 1, 1, 1], "5")]).errors[0]).toMatch(/deux fois/);
    expect(parseDecompte([header, row("VI01", [1, 1, 1, 1, 1], "")]).warnings[0]).toMatch(/pas de nombre/);
  });

  it("trouve l'année de chaque semaine grâce aux onglets des jours", () => {
    expect(decompteWeeks(["2026 S46A Jeudi", "Semaine 46", "Semaine 52", "2025 S52A Jeudi", "Semaine 99", "S29 rattrapage"])).toEqual([
      { sheetName: "Semaine 46", year: 2026, week: 46 },
      { sheetName: "Semaine 52", year: 2025, week: 52 },
    ]);
  });

  it("lit les nombres affichés", () => {
    expect(parseCount("2 938")).toBe(2938);
    expect(parseCount("2938,0")).toBe(2938);
    expect(parseCount("103,70%")).toBeNull();
  });
});

describe("lecture ciblée d'un onglet de classeur", () => {
  it("lit un seul onglet, avec chaînes partagées et nombres bruts", async () => {
    const JSZip = (await import("jszip")).default;
    const { openLightWorkbook } = await import("@/modules/imports/decompte/read-xlsx-sheet");
    const zip = new JSZip();
    zip.file(
      "xl/workbook.xml",
      `<workbook xmlns:r="r"><sheets><sheet name="2026 S45A Jeudi" sheetId="1" r:id="rId1"/><sheet name="Semaine 45" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    );
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`);
    zip.file("xl/sharedStrings.xml", `<sst><si><t>Ma production</t></si><si><t>A</t></si><si><t>VI01</t></si><si><r><t>Fa</t></r><r><t>res</t></r></si></sst>`);
    zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>3</v></c></row></sheetData></worksheet>`);
    zip.file(
      "xl/worksheets/sheet2.xml",
      `<worksheet><sheetData><row r="1"><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>605</v></c><c r="C2"><v>2938.0000001</v></c></row></sheetData></worksheet>`,
    );
    const wb = await openLightWorkbook(await zip.generateAsync({ type: "uint8array" }));
    expect(wb.sheetNames).toEqual(["2026 S45A Jeudi", "Semaine 45"]);
    const grid = (await wb.readSheet("Semaine 45"))!;
    expect(grid).toEqual([
      ["", "A", "Ma production"],
      ["VI01", "605", "2938.0000001"],
    ]);
    expect(parseDecompte(grid).rows.map((r) => [r.code, r.made])).toEqual([["VI01", 2938]]);
    expect(await wb.readSheet("Inconnu")).toBeNull();
  });
});
