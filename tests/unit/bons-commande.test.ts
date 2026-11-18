import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentGrams, purchaseLinePrice } from "@/domain/bons-commande";
import { type ParsedPurchaseOrder, parsePackaging, parsePurchaseOrder } from "@/modules/imports/bons-commande/parse-bon";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";

// Bons de commande réels (adresses e-mail remplacées), lus avec pdfjs puis gardés en texte positionné.
const DIR = "tests/fixtures/bons-commande";
const fixture = (name: string): PdfItem[] =>
  (JSON.parse(readFileSync(`${DIR}/${name}.items.json`, "utf8")) as [number, number, number, number, number, string][]).map(([page, x, y, width, size, text]) => ({ page, x, y, width, size, text }));
const order = (name: string): ParsedPurchaseOrder => {
  const r = parsePurchaseOrder(`${name}.pdf`, fixture(name));
  if (!r.ok) throw new Error(r.error);
  return r.order;
};

describe("lecture d'un bon de commande Melba", () => {
  it("lit l'en-tête : numéro, fournisseur, objet, semaine, dates, total", () => {
    const o = order("20261112_Guasch_S47_BC 20261105012");
    expect(o).toMatchObject({
      number: "20261105012",
      supplier: "Guasch",
      supplierLabel: "Guasch",
      subject: "S47 Camion B",
      week: 47,
      deliveryDate: "2026-11-12",
      orderedOn: "2026-11-05",
      totalEur: 2110.6,
      warnings: [],
    });
  });

  it("ne garde jamais d'adresse e-mail", () => {
    const o = order("20261110_Pro à Pro_S47_BC 20261104019");
    expect(JSON.stringify(o)).not.toMatch(/@/);
    expect(o.supplier).toBe("Pro à Pro");
    expect(o.supplierLabel).toBe("Pro à Pro (Neg)");
  });

  it("lit les lignes, désignations et conditionnements sur plusieurs lignes compris", () => {
    const o = order("20261112_Guasch_S47_BC 20261105012");
    expect(o.lines.map((l) => l.designation)).toEqual([
      "FARCE 50% BOEUF/50% VEAU S/V",
      "Merguez VBF (70g)",
      "Sauté de porc VPF Pyreneus excellence VPF",
      "chair à saucisse superieur",
      "filet mignon de porc Pyreneus excellence VPF",
      'saucisse de veau "la rosée pyrenees catalanes" (sans colorants & - sel) - 100Gr',
    ]);
    expect(o.lines[1]).toMatchObject({ supplierCode: null, category: "Viande", quantity: 4, packaging: { label: "Barquette", contentQuantity: 20, contentUnit: "Merguez" }, unitPriceEur: 8.5, priceUnit: "kg", totalEur: 47.6 });
    expect(o.lines[4]).toMatchObject({ supplierCode: "501130", priceUnit: "kgs", unitPriceEur: 10.5 });
    expect(o.lines[5]!.packaging).toEqual({ label: "Barquettes de 20 saucisse de 100gr", contentQuantity: 20, contentUnit: "saucisse" });
  });

  it("retrouve les colonnes quand l'en-tête est sur trois lignes, et corrige une parenthèse orpheline", () => {
    const o = order("20261110_APO_S47_BC 20261104036");
    expect(o.warnings).toEqual([]);
    expect(o.lines).toHaveLength(11);
    expect(o.lines[0]).toMatchObject({ designation: "ail pelé", supplierCode: "0201107", category: "Légume 4eme gamme: prêt à l'emploi", quantity: 6, packaging: { label: "Sachet 5kg", contentQuantity: 5, contentUnit: "kg" } });
    expect(o.lines[1]).toMatchObject({ designation: "basilic pdj", packaging: { label: "kg", contentQuantity: 1, contentUnit: "kg" }, unitPriceEur: 21, priceUnit: "kg" });
  });

  it("lit tous les bons d'essai sans écart avec leur total", () => {
    const names = readdirSync(DIR).map((f) => f.replace(/\.items\.json$/, ""));
    expect(names).toHaveLength(8);
    for (const name of names) {
      const o = order(name);
      expect(o.warnings, name).toEqual([]);
      const sum = o.lines.reduce((acc, l) => acc + (l.totalEur ?? 0), 0);
      expect(sum, name).toBeCloseTo(o.totalEur!, 1);
    }
  });

  it("lit les anciens bons (date en en-tête, autre mise en page)", () => {
    const o = order("20260302_Pro à Pro_S11_BC 20260226030");
    expect(o).toMatchObject({ supplier: "Pro à Pro", supplierLabel: "Pro à pro", week: 11, deliveryDate: "2026-03-02" });
    expect(o.lines).toHaveLength(12);
    expect(o.lines[3]).toMatchObject({ designation: "Lait de coco thai kitchen poche", packaging: { label: "Carton 12l", contentQuantity: 4, contentUnit: "poche 3l" }, priceUnit: "poche 3l" });
  });

  it("refuse un PDF qui n'est pas un bon de commande", () => {
    const r = parsePurchaseOrder("tome.pdf", [{ page: 1, x: 10, y: 800, width: 100, size: 18, text: "Imprimer les recettes" }]);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/pas un bon de commande/) });
  });
});

describe("conditionnement et prix au kg", () => {
  it("lit la contenance entre parenthèses", () => {
    expect(parsePackaging("Sachet (1kg) (1.00 kg)")).toEqual({ label: "Sachet (1kg)", contentQuantity: 1, contentUnit: "kg" });
    expect(parsePackaging("pot 1kg (1,000.00 g)")).toEqual({ label: "pot 1kg", contentQuantity: 1000, contentUnit: "g" });
    expect(parsePackaging("(KG) (1.00 kg)")).toEqual({ label: "(KG)", contentQuantity: 1, contentUnit: "kg" });
    expect(parsePackaging("kg")).toEqual({ label: "kg", contentQuantity: 1, contentUnit: "kg" });
    expect(contentGrams(350, "g")).toBe(350);
    expect(contentGrams(64, "cL")).toBeNull();
  });

  const price = (unitPriceEur: number, priceUnit: string, packaging: string) => purchaseLinePrice({ unitPriceEur, priceUnit, packaging: parsePackaging(packaging) });

  it("prix au kg, au colis ou à la pièce", () => {
    expect(price(9.5, "kg", "Sachet 5kg (5.00 kg)")).toEqual({ perKgEur: 9.5, perUnitEur: null });
    expect(price(10.5, "kgs", "kgs (1.00 kg)")).toEqual({ perKgEur: 10.5, perUnitEur: null });
    expect(price(32.5, "Carton", "Carton (5.00 kg)")).toEqual({ perKgEur: 6.5, perUnitEur: null });
    expect(price(9.39, "pot 1kg", "pot 1kg (1,000.00 g)")).toEqual({ perKgEur: 9.39, perUnitEur: null });
    expect(price(17.45, "Étui 475g", "Étui 475g (475 g)")).toEqual({ perKgEur: 36.7368, perUnitEur: null });
    expect(price(1.38, "Pot", "Pot (100.00 g)")).toEqual({ perKgEur: 13.8, perUnitEur: null });
    expect(price(10.28, "poche 3l", "Carton 12l (4 poche 3l)")).toEqual({ perKgEur: null, perUnitEur: 10.28 });
    expect(price(12, "Barquette", "Barquette (20.00 Merguez)")).toEqual({ perKgEur: null, perUnitEur: 0.6 });
  });

  it("aucun prix inventé : litre ou unité inconnue", () => {
    expect(price(5.07, "Bouteille 64cl", "Bouteille 64cl (64.00 cL)")).toEqual({ perKgEur: null, perUnitEur: null });
    expect(price(3, "Palette", "Carton (5.00 kg)")).toEqual({ perKgEur: null, perUnitEur: null });
  });
});
