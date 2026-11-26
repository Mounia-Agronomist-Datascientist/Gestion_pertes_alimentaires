/**
 * Filtres de la liste des produits (Administration → Produits ; décision du 26/11/2026) : type, catégorie Melba,
 * fournisseur, lieu de stockage et recherche se cumulent. Chaque liste de choix ne propose que les valeurs qui donnent
 * au moins un produit avec les autres filtres déjà choisis, avec le nombre de produits correspondants.
 */

export interface FilterableProduct {
  name: string;
  variant: string | null;
  code: string | null;
  category: string;
  /** Catégorie Melba (null = sans catégorie). */
  materialCategoryId: string | null;
  supplierIds: string[];
  /** Lieu de stockage effectif (celui du produit, sinon celui de sa catégorie Melba ; null = aucun). */
  storageId: string | null;
}

export interface ProductFilters {
  /** Type de produit ; "" = tous. */
  category: string;
  /** Catégorie Melba ; "" = toutes, "aucune" = sans catégorie. */
  materialCategory: string;
  /** Fournisseur ; "" = tous. */
  supplier: string;
  /** Lieu de stockage ; "" = tous, "aucun" = sans lieu. */
  storage: string;
  search: string;
}

export const NO_FILTERS: ProductFilters = { category: "", materialCategory: "", supplier: "", storage: "", search: "" };

/** Comparaison sans accents ni majuscules. */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

type Key = Exclude<keyof ProductFilters, "search">;

function matches(p: FilterableProduct, f: ProductFilters, skip?: Key): boolean {
  if (skip !== "category" && f.category && p.category !== f.category) return false;
  if (skip !== "materialCategory" && f.materialCategory) {
    if (f.materialCategory === "aucune" ? p.materialCategoryId : p.materialCategoryId !== f.materialCategory)
      return false;
  }
  if (skip !== "supplier" && f.supplier && !p.supplierIds.includes(f.supplier)) return false;
  if (skip !== "storage" && f.storage) {
    if (f.storage === "aucun" ? p.storageId : p.storageId !== f.storage) return false;
  }
  const q = fold(f.search.trim());
  return !q || fold(`${p.name} ${p.variant ?? ""} ${p.code ?? ""}`).includes(q);
}

export function filterProducts<P extends FilterableProduct>(products: P[], filters: ProductFilters): P[] {
  return products.filter((p) => matches(p, filters));
}

/**
 * Nombre de produits par valeur d'un filtre, compte tenu de tous les autres filtres. Clé "" = sans valeur
 * (sans catégorie Melba, sans lieu de stockage) ; un produit chez deux fournisseurs compte pour chacun.
 */
export function facetCounts(products: FilterableProduct[], filters: ProductFilters, key: Key): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (v: string) => counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const p of products) {
    if (!matches(p, filters, key)) continue;
    if (key === "supplier") p.supplierIds.forEach(bump);
    else if (key === "category") bump(p.category);
    else if (key === "materialCategory") bump(p.materialCategoryId ?? "");
    else bump(p.storageId ?? "");
  }
  return counts;
}
