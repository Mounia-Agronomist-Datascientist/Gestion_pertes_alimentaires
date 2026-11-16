import { describe, expect, it } from "vitest";
import { parseAmount, parseBoxes, parseLot, parseSheetDate, parseSurplus, sheetsToRead } from "@/modules/imports/surplus/parse-surplus";

// Extraits reconstitués des fichiers de l'entreprise (valeurs brutes de l'export Excel : dates en numéro de série).
const TGTG_HEADER = ["Date ", "Nb barquettes à vendre", "", "Nb barquettes vendues en VF", "", "Nb barquettes proposées TGTG", "", "Nb barquettes vendues TGTG", "", "Formules TGTG", "", "CA TGTG", "RESULTAT REEL"];
// 2026-01-02 = 46024, 2026-01-07 = 46029, 2026-01-12 = 46034, 2026-02-09 = 46062.
const tgtg2026 = [
  TGTG_HEADER,
  ["46024.0", "8313.0", "", "6150.0", "", "", "", "", "", "", "", "", "6560.23", "", "Au 30/10"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "13380"],
  ["46029.0", "", "", "", "", "180.0", "", "180.0", "", "2P + 1 PDJ", "", "474.0", ""],
  ["46034.0", "", "", "", "", "480.0", "", "480.0", "", "6P ", "", "1999.2", ""],
  ["46062.0", "729.0", "", "", "", "300.0", "", "390.0", "", "6P ", "", "", ""],
  ["Arrêt maladie ", "", "", "", "", "", "", "", "", "", "", "", "4912.17"],
];
// Onglet 2025 : colonnes « CA TGTG » et « Formules » inversées, ligne d'année, date avec la mauvaise année.
const tgtg2025 = [
  ["Date ", "Nb barquettes à vendre", "", "Nb barquettes vendues en VF", "", "Nb barquettes proposées TGTG", "", "Nb barquettes vendues TGTG", "", "CA TGTG", "Formules TGTG", ""],
  ["2025.0", "", "", "", "", "", "", "", "", "", "", ""],
  ["45660.0", "1345.0", "", "440.0", "", "75.0", "", "75.0", "", "197.5", "2P + 1 dessert", ""],
  ["46374.0", "", "", "", "", "100", "", "90", "", "250", "6P", ""],
];

const VF_HEADER = ["Date ", "Code ", "Clients concernés ", "", "Nb clients", "Type de formule ", "", "Prix ", "Quantités boxes vendues ", "", "Chiffre d'affaire TTC", ""];
const vf2026 = [
  [],
  [],
  VF_HEADER,
  ["46052.0", "VF300126", "Clients en pause tte France ", "", "567.0", "10P (1 ou 2 box)", "", "70€/120€", "70 (dont 22 x 2box)", "", "4530.0", ""],
  ["46150.0", "VF070526", "Clients en pause tte France ", "", "530.0", "10P (1 ou 2 box)", "", "70€/120€", "5.0", "", "350.0", "", "Week-end de l'ascencion "],
];
const vf2024 = [
  ["VENTES FLASH  2024"],
  [],
  [],
  ["Date ", "Code ", "Clients concernés ", "", "Nb clients", "Type de formule ", "", "Prix ", "Quantités boxes vendues ", "", "Commentaires "],
  ["45559.0", "VF2409", "Clients en pause tte France ", "", "405.0", "10P / 10P + PDJ", "", "70€ / 80€ ", "41 dt 18 avec PDJ", "", ""],
  ["45561.0", "VF2609", "Clients en pause tte France ", "", "349.0", "10P + PDJ", "", "80.0", "21.0", "", ""],
  ["45548.0", "VF1309", "Clients en pause tte France ", "", "419.0", "12P / 12P + PDJ", "", "80€ / 90€", "/", "", ""],
  ["45604.0", "VF0811", "Clients en pause tte France ", "", "400.0", "10P (1 ou 2 box)", "", "70€/120€", "47 (25x1 et 11x2)", "", ""],
];

// Contacts (colonnes I et J) : jamais lus.
const LINKEE_HEADER = ["Date de collecte ", "Nombre TOTAL barquette ", "Nombre de barquette ", "Nom plat", "N lot", "Cout de revient unitaire", "DLC", "Collecté ? ", "Contact "];
const linkee = [
  LINKEE_HEADER,
  ["", "", "", "", "", "", "", "", "Contact A", "06 00 00 00 00"],
  ["46066.0", "101.0", "36.0", "Tagliatelles saumon et poireaux ", "L7-100226-L1-PO04", "", "46076.0", "1"],
  ["", "", "36.0", "Gratin Crozets aux noix ", "L7-060226-L2_FB01", "", "46072.0", "1"],
  ["", "", "29.0", "Parmentier végétarien", "L7-090226-L1-VG06", "", "46075.0", ""],
  ["46100.0", "804.0", "804.0", "Yaourt nature", "2.0260203E7", "", "46102.0", "1"],
  ["", "304.0", "304.0", "Yaourt framboises", "22/04 21:49 E", "", "46103.0", "1"],
  ["0", "142.0", "24.0", "Dos colin à la crème", "L12-180326-L3-PO02", "", "46112.0", "1"],
  ["46108.0", "", "12.0", "Lasagnes au saumon", "L13-230326-L3-FB08", "", "46117.0", "1"],
  ["46108.0", "", "106.0", "Gratin d'endives", "L12-1800326-L3-VI03", "", "46112.0", "1"],
  ["46288.0", "144.0", "-", "Curry de boeuf", "L38-160926-L3-FB01", "", "46294.0", "1"],
  ["46288.0", "", "144.0", "Saucisse de volaille", "L38-160926-L2-QD07", "", "46294.0", "1"],
];

describe("valeurs des fichiers de ventes et de dons", () => {
  it("lit les dates : numéro de série, jour/mois avec l'année de l'onglet, jj/mm/aa", () => {
    expect(parseSheetDate("46024.0")).toBe("2026-01-02");
    expect(parseSheetDate("7/1", 2026)).toBe("2026-01-07");
    expect(parseSheetDate("7/1")).toBeNull();
    expect(parseSheetDate("30/01/26")).toBe("2026-01-30");
    expect(parseSheetDate("18/04/2025")).toBe("2025-04-18");
    expect(parseSheetDate("31/02/26")).toBeNull();
    expect(parseSheetDate("Arrêt maladie")).toBeNull();
  });

  it("lit les montants écrits à la française ou bruts", () => {
    expect(parseAmount("1 999,20 €")).toBe(1999.2);
    expect(parseAmount("6560.23")).toBe(6560.23);
    expect(parseAmount("27 528€")).toBe(27528);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("70€/120€")).toBeNull();
  });

  it("lit les quantités de boxes", () => {
    expect(parseBoxes("41 dt 18 avec PDJ")).toEqual({ boxes: 41, breakfastBoxes: 18, doubles: null });
    expect(parseBoxes("70 (dont 22 x 2box)")).toEqual({ boxes: 70, breakfastBoxes: null, doubles: 22 });
    expect(parseBoxes("40 (dont 16 PDJ)")).toEqual({ boxes: 40, breakfastBoxes: 16, doubles: null });
    expect(parseBoxes("47 (25x1 et 11x2)")).toEqual({ boxes: 47, breakfastBoxes: null, doubles: 11 });
    expect(parseBoxes("5.0")).toEqual({ boxes: 5, breakfastBoxes: null, doubles: null });
    expect(parseBoxes("/")).toBeNull();
  });

  it("lit le n° de lot : semaine, date de production, code plat", () => {
    expect(parseLot("L41-071026-L2-VI01")).toEqual({ week: 41, producedOn: "2026-10-07", dishCode: "VI01" });
    expect(parseLot("L7-060226-L2_FB01")).toEqual({ week: 7, producedOn: "2026-02-06", dishCode: "FB01" });
    expect(parseLot("L43-211026-L1PO05")).toEqual({ week: 43, producedOn: "2026-10-21", dishCode: "PO05" });
    expect(parseLot("L12-1800326-L2-VG03")).toEqual({ week: 12, producedOn: null, dishCode: "VG03" });
    expect(parseLot("20260203")).toEqual({ week: null, producedOn: null, dishCode: null });
  });

  it("ne lit que les onglets des ventes d'un classeur", () => {
    expect(sheetsToRead(["TGTG2024", "TGTG2025", "Notes"])).toEqual(["TGTG2024", "TGTG2025"]);
    expect(sheetsToRead(["Linkee"])).toEqual(["Linkee"]);
  });
});

describe("fichier « VENTES TGTG »", () => {
  const r = parseSurplus([
    { name: "TGTG2025", grid: tgtg2025 },
    { name: "TGTG2026", grid: tgtg2026 },
  ]);

  it("reconnaît le fichier et sépare ventes et versements", () => {
    expect(r.source).toBe("tgtg");
    expect(r.errors).toEqual([]);
    const sales = r.entries.filter((e) => e.kind === "vente");
    const payouts = r.entries.filter((e) => e.kind === "versement");
    expect(sales.map((e) => [e.date, e.trays, e.offeredTrays, e.formula, e.amountEur])).toEqual([
      ["2025-01-03", 75, 75, "2P + 1 dessert", 197.5],
      ["2025-12-18", 90, 100, "6P", 250],
      ["2026-01-07", 180, 180, "2P + 1 PDJ", 474],
      ["2026-01-12", 480, 480, "6P", 1999.2],
      ["2026-02-09", 390, 300, "6P", null],
    ]);
    // Versement sans date (« Arrêt maladie ») : date de la ligne précédente.
    expect(payouts.map((e) => [e.date, e.amountEur])).toEqual([
      ["2026-01-02", 6560.23],
      ["2026-02-09", 4912.17],
    ]);
    expect(r.periodFrom).toBe("2025-01-03");
    expect(r.periodTo).toBe("2026-02-09");
  });

  it("signale les points à vérifier sans rien inventer", () => {
    expect(r.warnings).toEqual([
      "TGTG2025, ligne 4 : date du 18/12/2026 dans l'onglet 2025 ; le 18/12/2025 est gardé.",
      "TGTG2026, ligne 6 (09/02/2026) : 390 barquettes vendues pour 300 proposées.",
      "TGTG2026, ligne 7 : « Arrêt maladie » n'est pas une date ; la date de la ligne précédente (09/02/2026) est gardée.",
      "TGTG2026 : 1 vente sans « CA TGTG ».",
    ]);
  });
});

describe("fichier « VENTES FLASH »", () => {
  const r = parseSurplus([
    { name: "VF2024", grid: vf2024 },
    { name: "VF2026", grid: vf2026 },
  ]);

  it("compte 10 barquettes par box et 5 barquettes de petit-déjeuner par box avec PDJ", () => {
    expect(r.source).toBe("vente_flash");
    expect(r.entries.map((e) => [e.date, e.code, e.boxes, e.breakfastBoxes, e.trays, e.breakfastTrays, e.amountEur, e.note])).toEqual([
      ["2024-09-24", "VF2409", 41, 18, 410, 90, null, null],
      ["2024-09-26", "VF2609", 21, 21, 210, 105, null, null],
      ["2024-11-08", "VF0811", 47, 0, 470, 0, null, "dont 11 achats de 2 boxes"],
      ["2026-01-30", "VF300126", 70, 0, 700, 0, 4530, "dont 22 achats de 2 boxes"],
      ["2026-05-08", "VF070526", 5, 0, 50, 0, 350, "Week-end de l'ascencion"],
    ]);
  });

  it("signale l'onglet sans chiffre d'affaires et la vente illisible", () => {
    expect(r.warnings).toEqual([
      "VF2024 : pas de colonne « Chiffre d'affaire TTC » ; ventes enregistrées sans montant.",
      "VF2024, ligne 7 (13/09/2024) : quantité « / » illisible, vente ignorée.",
    ]);
  });
});

describe("fichier Linkee", () => {
  const r = parseSurplus([{ name: "Linkee", grid: linkee }]);

  it("regroupe les plats par collecte et lit les n° de lot", () => {
    expect(r.source).toBe("linkee");
    expect(r.entries.map((e) => [e.date, e.trays, e.dishCode, e.producedOn, e.bestBefore, e.collected])).toEqual([
      ["2026-02-13", 36, "PO04", "2026-02-10", "2026-02-23", true],
      ["2026-02-13", 36, "FB01", "2026-02-06", "2026-02-19", true],
      ["2026-02-13", 29, "VG06", "2026-02-09", "2026-02-22", false],
      ["2026-03-19", 804, null, null, "2026-03-21", true],
      ["2026-03-19", 304, null, null, "2026-03-22", true],
      ["2026-03-27", 24, "PO02", "2026-03-18", "2026-03-31", true],
      ["2026-03-27", 12, "FB08", "2026-03-23", "2026-04-05", true],
      ["2026-03-27", 106, "VI03", null, "2026-03-31", true],
      ["2026-09-23", 144, "QD07", "2026-09-16", "2026-09-29", true],
    ]);
    expect(r.entries[3]!.lot).toBe("20260203");
  });

  it("contrôle les totaux de collecte et ne lit jamais les contacts", () => {
    expect(r.warnings).toEqual([
      "Linkee, ligne 8 : date vide, celle de la ligne suivante (27/03/2026) est gardée.",
      "Linkee, ligne 11 (23/09/2026) : nombre de barquettes « - » illisible pour « Curry de boeuf », ligne ignorée.",
      "1 n° de lot dont la date de production ou le code plat ne se lisent pas.",
      "1 plat sans « Collecté ? » coché (enregistrés comme non collectés).",
    ]);
    expect(JSON.stringify(r)).not.toContain("Contact A");
    expect(JSON.stringify(r)).not.toContain("06 00");
  });
});

it("refuse un fichier non reconnu", () => {
  const r = parseSurplus([{ name: "Feuille 1", grid: [["a", "b"]] }]);
  expect(r.source).toBeNull();
  expect(r.errors[0]).toMatch(/Fichier non reconnu/);
});
