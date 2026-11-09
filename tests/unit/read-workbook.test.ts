import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { displayedText, listWorkbookSheets, readWorkbookSheet } from "@/modules/imports/plan/read-workbook";

/** Classeur semblable à un téléchargement Google Sheets : plusieurs onglets, nombres et formules. */
async function workbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Chefs d'équipe").addRow(["Équipe A", "adresse@exemple.fr"]);
  const sheet = wb.addWorksheet("S46");
  sheet.addRow(["Référence PLATS", "", "Cuisson longue", "Nb de barq.", "Equipe"]);
  sheet.addRow(["VI01/QD01", 2, "Non", 950, "D"]);
  sheet.addRow(["VG02", 1, "Non", { formula: "500+93", result: 593 }, "E"]);
  sheet.addRow([]);
  sheet.getCell("D6").value = "VI01";
  sheet.getCell("E6").value = 2953;
  sheet.getCell("F6").value = 605;
  sheet.getCell("D7").value = "QD01";
  sheet.getCell("E7").value = 1136;
  sheet.getCell("F7").value = 233;
  sheet.getCell("D8").value = "VG02";
  sheet.getCell("E8").value = 2895;
  sheet.getCell("F8").value = 593;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("lecture du classeur Excel du plan de production", () => {
  it("liste les onglets et ne lit que celui de la semaine", async () => {
    const data = await workbook();
    expect(await listWorkbookSheets(data)).toEqual(["Chefs d'équipe", "S46"]);
    const grid = await readWorkbookSheet(data, "S46");
    expect(JSON.stringify(grid)).not.toMatch(/adresse@/);
    expect(grid?.[2]?.[3]).toBe("593"); // résultat de la formule
    const plan = parsePlan("S46", grid!);
    expect(plan.groups.map((g) => [g.codes.join("/"), g.team, g.barquettes])).toEqual([
      ["VI01/QD01", "D", 950],
      ["VG02", "E", 593],
    ]);
    expect(plan.volumes.map((v) => v.code)).toEqual(["VI01", "QD01", "VG02"]);
    expect(plan.anomalies).toEqual([]);
  });

  it("applique le format d'affichage des nombres, comme Google Sheets", () => {
    expect(displayedText({ value: { formula: "A1*0.5", result: 676.5 } as never, numFmt: "0", text: "676.5" })).toBe("677");
    expect(displayedText({ value: 2.386363636, numFmt: "0.0", text: "2.386363636" })).toBe("2.4");
    expect(displayedText({ value: 50.6, numFmt: undefined as never, text: "50.6" })).toBe("50.6");
    expect(displayedText({ value: "A", numFmt: "0", text: "A" })).toBe("A");
  });

  it("renvoie null pour un onglet absent", async () => {
    expect(await readWorkbookSheet(await workbook(), "S47")).toBeNull();
  });
});
