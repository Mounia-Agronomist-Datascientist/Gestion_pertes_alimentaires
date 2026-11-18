/**
 * Prix d'une ligne de bon de commande ramené au kg (ou à la pièce), docs/PHASE6.md étape 6.8.
 * Jamais deviné : null quand le bon ne permet pas de le calculer (colis sans poids, prix au litre d'une matière sans
 * densité). Un prix au litre est ramené au kg avec la densité de la matière (décision du 18/11/2026).
 */
import type { UnitCost } from "./couts";

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Grammes d'une contenance (« 5 kg », « 350 g », « 1 kgs », « 100 gr ») ; null pour un volume ou un nombre de pièces. */
export function contentGrams(quantity: number | null, unit: string | null): number | null {
  if (quantity == null || !unit) return null;
  const u = fold(unit);
  if (/^kgs?$/.test(u)) return quantity * 1000;
  if (/^(g|gr|grs|grammes?)$/.test(u)) return quantity;
  return null;
}

const LITRES: Record<string, number> = { l: 1, litre: 1, litres: 1, cl: 0.01, ml: 0.001 };
/** Litres d'une contenance (« 64 cL », « 5 L ») ; null pour un poids ou un nombre de pièces. */
export function contentLitres(quantity: number | null, unit: string | null): number | null {
  if (quantity == null || !unit) return null;
  const factor = LITRES[fold(unit)];
  return factor == null ? null : quantity * factor;
}
const isVolume = (unit: string) => Object.hasOwn(LITRES, fold(unit));

export interface PurchaseLinePriceInput {
  unitPriceEur: number;
  priceUnit: string;
  packaging: { label: string; contentQuantity: number | null; contentUnit: string | null } | null;
}

export function purchaseLinePrice(line: PurchaseLinePriceInput, densityKgPerL: number | null = null): UnitCost {
  const none: UnitCost = { perKgEur: null, perUnitEur: null };
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  const unit = fold(line.priceUnit);
  if (/^kgs?$/.test(unit)) return { perKgEur: round(line.unitPriceEur), perUnitEur: null };
  if (/^(g|gr)$/.test(unit)) return { perKgEur: round(line.unitPriceEur * 1000), perUnitEur: null };
  // Prix au litre (ou au cL) : au kg avec la densité, sinon pas de prix.
  if (Object.hasOwn(LITRES, unit))
    return densityKgPerL
      ? { perKgEur: round(line.unitPriceEur / (LITRES[unit]! * densityKgPerL)), perUnitEur: null }
      : none;
  const p = line.packaging;
  if (!p) return none;
  // Prix d'une pièce du colis (« 10.28 € / poche 3l » pour un carton de 4 poches) : prix à la pièce.
  if (
    p.contentUnit &&
    unit === fold(p.contentUnit) &&
    !isVolume(p.contentUnit) &&
    contentGrams(1, p.contentUnit) == null
  ) {
    return { perKgEur: null, perUnitEur: round(line.unitPriceEur) };
  }
  // Prix du colis (« 32.50 € / Carton » pour un carton de 5 kg).
  if (unit === fold(p.label) || fold(p.label).startsWith(unit)) {
    const grams = contentGrams(p.contentQuantity, p.contentUnit);
    if (grams) return { perKgEur: round((line.unitPriceEur / grams) * 1000), perUnitEur: null };
    const litres = contentLitres(p.contentQuantity, p.contentUnit);
    if (litres)
      return densityKgPerL ? { perKgEur: round(line.unitPriceEur / (litres * densityKgPerL)), perUnitEur: null } : none;
    if (p.contentQuantity && p.contentUnit && !isVolume(p.contentUnit))
      return { perKgEur: null, perUnitEur: round(line.unitPriceEur / p.contentQuantity) };
  }
  return none;
}
