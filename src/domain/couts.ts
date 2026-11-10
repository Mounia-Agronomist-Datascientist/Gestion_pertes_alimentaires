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
 * Coût matière estimé d'une perte : nombre × coût unitaire pour une quantité comptée (barquettes, pièces : le
 * coût d'une portion est le plus exact), sinon poids net × coût au kg ; null si le coût ou la conversion manquent
 * (jamais deviné).
 */
export function estimateLossCost(loss: { netKg: number | null; quantity: number; unitCode: string }, cost: UnitCost): number | null {
  if (cost.perUnitEur != null && COUNT_UNITS.has(loss.unitCode)) return roundQuantity(loss.quantity * cost.perUnitEur);
  if (loss.netKg != null && cost.perKgEur != null) return roundQuantity(loss.netKg * cost.perKgEur);
  return null;
}

/** Méthode de calcul enregistrée avec chaque perte (§18.5) ; à changer si la méthode évolue. */
export const COST_METHOD = "melba-semaine+emballages-v1";

export interface CostInputs {
  /** Coût matières du produit (hors moules et plats à gratin). */
  food: UnitCost;
  /** Coût des emballages par portion (moules Melba + référentiel des emballages) ; null s'il ne s'applique pas. */
  packagingPerPortionEur: number | null;
  /** Poids d'une portion, pour compter les portions d'une perte pesée. */
  portionWeightKg: number | null;
  /** Produit qui est lui-même un emballage (moule, plat à gratin) : son coût va dans les emballages. */
  packagingItself?: UnitCost;
}

export interface CostBreakdown {
  /** Nombre de portions perdues (plats) : barquettes comptées, ou poids net ÷ poids d'une portion. */
  portions: number | null;
  foodEur: number | null;
  packagingEur: number | null;
  /** Main-d'œuvre : non imputée tant que la méthode n'est pas définie (§18.2). */
  labourEur: null;
  /** Charges indirectes : version ultérieure (§18.4). */
  indirectEur: null;
  /** Somme des composantes connues ; null si aucune n'est connue. */
  grossEur: number | null;
}

/** Coût brut d'une perte par composante (cahier des charges §18.6). */
export function lossCostBreakdown(loss: { netKg: number | null; quantity: number; unitCode: string }, inputs: CostInputs): CostBreakdown {
  const portions = COUNT_UNITS.has(loss.unitCode)
    ? loss.quantity
    : loss.netKg != null && inputs.portionWeightKg
      ? roundQuantity(loss.netKg / inputs.portionWeightKg)
      : null;
  const foodEur = estimateLossCost(loss, inputs.food);
  const packagingEur = inputs.packagingItself
    ? estimateLossCost(loss, inputs.packagingItself)
    : portions != null && inputs.packagingPerPortionEur != null
      ? roundQuantity(portions * inputs.packagingPerPortionEur)
      : null;
  const known = [foodEur, packagingEur].filter((v): v is number => v != null);
  return {
    portions,
    foodEur,
    packagingEur,
    labourEur: null,
    indirectEur: null,
    grossEur: known.length ? roundQuantity(known.reduce((a, b) => a + b, 0)) : null,
  };
}

/**
 * Part des moules et plats à gratin dans le coût Melba d'une recette, sous-recettes comprises (au prorata de la
 * quantité de sous-recette utilisée). Sert à isoler les emballages déjà inclus dans le coût Melba (§18.1).
 */
export function mouldCostOf<L extends { label: string; costEur: number | null; subRecipeId: string | null }>(
  lines: readonly L[],
  subRecipes: ReadonlyMap<string, { totalCostEur: number | null; lines: readonly L[] }>,
  isMould: (label: string) => boolean,
  depth = 0,
): number {
  let total = 0;
  for (const line of lines) {
    if (line.costEur == null) continue;
    if (isMould(line.label)) {
      total += line.costEur;
    } else if (line.subRecipeId && depth < 5) {
      const sub = subRecipes.get(line.subRecipeId);
      if (!sub?.totalCostEur) continue;
      total += line.costEur * (mouldCostOf(sub.lines, subRecipes, isMould, depth + 1) / sub.totalCostEur);
    }
  }
  return Math.round(total * 10_000) / 10_000;
}
