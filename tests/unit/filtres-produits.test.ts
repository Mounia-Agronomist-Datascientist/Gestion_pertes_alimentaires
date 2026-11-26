import { describe, expect, it } from "vitest";
import { type FilterableProduct, NO_FILTERS, facetCounts, filterProducts } from "@/domain/filtres-produits";

const p = (name: string, over: Partial<FilterableProduct> = {}): FilterableProduct => ({
  name,
  variant: null,
  code: null,
  category: "matiere_premiere",
  materialCategoryId: null,
  supplierIds: [],
  storageId: null,
  ...over,
});

const products = [
  p("Beurre doux", { materialCategoryId: "cremerie", supplierIds: ["passion"], storageId: "bof" }),
  p("Crème épaisse", { materialCategoryId: "cremerie", supplierIds: ["gerentes", "passion"], storageId: "bof" }),
  p("Filet de poulet", { materialCategoryId: "viande", supplierIds: ["passion"], storageId: "bof" }),
  p("Petits pois", { materialCategoryId: "surgele", supplierIds: ["proapro"], storageId: "negative" }),
  p("Sel fin", { supplierIds: ["proapro"] }),
  p("Cookies", { category: "produit_externe", supplierIds: ["croc"], storageId: "encas" }),
];

describe("filtres de la liste des produits (décision du 26/11/2026)", () => {
  it("catégorie Melba, fournisseur et lieu se cumulent", () => {
    const names = (f: Partial<typeof NO_FILTERS>) =>
      filterProducts(products, { ...NO_FILTERS, ...f }).map((x) => x.name);
    expect(names({ materialCategory: "cremerie", supplier: "passion" })).toEqual(["Beurre doux", "Crème épaisse"]);
    expect(names({ materialCategory: "cremerie", supplier: "gerentes" })).toEqual(["Crème épaisse"]);
    expect(names({ supplier: "passion", storage: "bof", search: "poulet" })).toEqual(["Filet de poulet"]);
    expect(names({ materialCategory: "aucune", storage: "aucun" })).toEqual(["Sel fin"]);
    expect(names({ category: "produit_externe", supplier: "passion" })).toEqual([]);
    expect(names({ search: "creme" })).toEqual(["Crème épaisse"]);
  });

  it("chaque liste ne compte que les produits qui restent avec les autres filtres", () => {
    const suppliers = facetCounts(products, { ...NO_FILTERS, materialCategory: "cremerie" }, "supplier");
    expect(Object.fromEntries(suppliers)).toEqual({ passion: 2, gerentes: 1 });
    const categories = facetCounts(products, { ...NO_FILTERS, supplier: "proapro" }, "materialCategory");
    expect(Object.fromEntries(categories)).toEqual({ surgele: 1, "": 1 });
    // Le filtre lui-même ne restreint pas sa propre liste.
    const places = facetCounts(products, { ...NO_FILTERS, storage: "bof", supplier: "passion" }, "storage");
    expect(Object.fromEntries(places)).toEqual({ bof: 3 });
  });
});
