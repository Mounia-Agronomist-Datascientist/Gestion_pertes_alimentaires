/**
 * Coût matière d'une perte d'après le tome Melba de sa semaine (docs/PHASE2.md, étape 2.6).
 * Les coûts sont ceux de Melba, référence de l'entreprise. Ils sont figés sur la déclaration au moment de la
 * saisie : un nouveau tome ne change pas la valeur d'une perte passée.
 */
import { roundQuantity } from "./nombres";

export interface UnitCost {
  /** Coût d'un kg du produit (poids net, après cuisson pour une préparation). */
  perKgEur: number | null;
  /** Coût d'une unité comptée (portion / barquette, pièce) quand le produit se compte. */
  perUnitEur: number | null;
}

const NONE: UnitCost = { perKgEur: null, perUnitEur: null };
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Grammes d'une quantité exprimée en g ou kg ; null pour toute autre unité. */
export function gramsOf(quantity: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "g") return quantity;
  if (u === "kg") return quantity * 1000;
  return null;
}

/** Plat ou encas : coût d'une portion (« Recette totale ») et poids de la portion. */
export function dishUnitCost(costEur: number | null, portionWeightG: number | null): UnitCost {
  if (costEur == null) return NONE;
  return { perUnitEur: round4(costEur), perKgEur: portionWeightG ? round4((costEur / portionWeightG) * 1000) : null };
}

/** Sous-recette : coût total des ingrédients rapporté au poids net obtenu (« Poids net »). */
export function subRecipeUnitCost(costEur: number | null, net: { quantity: number; unit: string } | null): UnitCost {
  const grams = net ? gramsOf(net.quantity, net.unit) : null;
  if (costEur == null || !grams) return NONE;
  return { perKgEur: round4((costEur / grams) * 1000), perUnitEur: null };
}

/** Ingrédient : coût de la ligne rapporté à sa quantité (en grammes, ou par pièce si elle se compte). */
export function ingredientUnitCost(line: { costEur: number | null; quantity: number; unit: string; unitWeightG: number | null }): UnitCost {
  if (line.costEur == null || line.quantity <= 0) return NONE;
  const grams = gramsOf(line.quantity, line.unit) ?? (line.unitWeightG ? line.quantity * line.unitWeightG : null);
  const counted = gramsOf(1, line.unit) == null;
  return {
    perKgEur: grams ? round4((line.costEur / grams) * 1000) : null,
    perUnitEur: counted ? round4(line.costEur / line.quantity) : null,
  };
}

/** Unités comptées auxquelles s'applique un coût unitaire (une portion = une barquette, règle R10). */
const COUNT_UNITS = new Set(["piece", "barquette"]);

/**
 * Coût matière estimé d'une perte : poids net × coût au kg, sinon nombre × coût unitaire pour une quantité
 * comptée ; null si le coût ou la conversion manquent (jamais deviné).
 */
export function estimateLossCost(loss: { netKg: number | null; quantity: number; unitCode: string }, cost: UnitCost): number | null {
  if (loss.netKg != null && cost.perKgEur != null) return roundQuantity(loss.netKg * cost.perKgEur);
  if (cost.perUnitEur != null && COUNT_UNITS.has(loss.unitCode)) return roundQuantity(loss.quantity * cost.perUnitEur);
  return null;
}
