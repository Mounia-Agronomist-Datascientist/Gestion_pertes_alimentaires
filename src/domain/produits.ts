/**
 * Nom affiché d'un produit : un plat de la semaine apparaît partout avec son code Melba devant son nom,
 * « VI04_Ragoût de porc » (demande du 12/11/2026). Le nom enregistré sur la perte ne change pas.
 */
export function productLabel(name: string, code: string | null | undefined): string {
  return code ? `${code}_${name}` : name;
}
