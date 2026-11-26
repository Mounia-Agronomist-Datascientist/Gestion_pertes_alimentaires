/**
 * Nom et clé d'un fournisseur (décision du 26/11/2026). Les bons de commande nomment parfois un même fournisseur de
 * plusieurs façons : « Passion Froid » et « Passion Froid (BOF) », « Moulin de Sauret (Stock Sécu) », « Pro à Pro
 * (Neg) », ou avec son n° SIREN/SIRET. La clé ne garde que le nom, sans ce qui est entre parenthèses ni le n° SIRET :
 * tous ces bons retrouvent le même fournisseur. Le nom affiché n'a jamais de n° SIRET.
 */

/** Nom sans mention « SIREN/SIRET : 391 968 815 00038 » (ni « SIRET », « SIREN » seuls). */
export function cleanSupplierName(name: string): string {
  return name
    .replace(/\s*[-–,]?\s*SIRE[NT](\s*\/\s*SIRE[NT])?\s*:?\s*[0-9][0-9 ]*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Clé de rapprochement : nom sans parenthèses ni SIRET, sans accents, majuscules ni ponctuation. */
export function supplierKey(name: string): string {
  return cleanSupplierName(name)
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
