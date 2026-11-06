/** Arrondi décimal sans erreurs de représentation visibles (ex. 3 × 1,1 = 3,3 et non 3,3000000000000003). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Précision de stockage des quantités (0,1 g en kg). */
export const QUANTITY_DECIMALS = 4;

export function roundQuantity(value: number): number {
  return roundTo(value, QUANTITY_DECIMALS);
}
