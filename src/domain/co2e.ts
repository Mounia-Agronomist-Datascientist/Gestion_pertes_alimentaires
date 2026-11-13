/**
 * Impact CO2e des denrées perdues (docs/PHASE5.md, étape 5.6 ; cahier des charges §20.2 et §20.3).
 *
 * Calcul à partir de la recette Melba (décision du 12/11/2026) :
 * - ingrédient : poids × facteur validé de sa famille ;
 * - sous-recette : CO2e de ses ingrédients rapporté à son poids net après cuisson (comme son coût, règle R11) ;
 * - plat : CO2e d'une portion (ingrédients et sous-recettes de la portion).
 * Un ingrédient sans famille, sans facteur validé ou non couvert n'est jamais estimé : sa part du poids des
 * ingrédients est comptée en kg « non couverts ». Les contenants (non alimentaires) sont ignorés.
 */
import { gramsOf } from "./couts";
import { roundQuantity } from "./nombres";
import { toProductionLocalDate } from "./semaine-production";

export interface RecipeLine {
  key: string;
  isSubRecipe: boolean;
  componentSubRecipeId: string | null;
  quantity: number;
  unit: string;
  unitWeightG: number | null;
}

export interface SubRecipeData {
  lines: RecipeLine[];
  netQuantity: number | null;
  netUnit: string | null;
  grossQuantity: number | null;
  grossUnit: string | null;
}

/** Facteur d'un ingrédient (par sa clé) : valeur et version, « non couvert », ou « non alimentaire » (ignoré). */
export type IngredientFactor = { kgCo2ePerKg: number; factorId: string } | "non_couvert" | "non_alimentaire";

export interface Composition {
  /** kg CO2e de la quantité de référence (portion de plat, recette de sous-recette). */
  co2eKg: number;
  /** Grammes d'ingrédients couverts par un facteur validé, et non couverts. */
  coveredG: number;
  uncoveredG: number;
  /** Lignes dont le poids est inconnu (unité sans poids) : ni couvertes ni pesées. */
  unweighed: number;
  factorIds: Set<string>;
}

const empty = (): Composition => ({ co2eKg: 0, coveredG: 0, uncoveredG: 0, unweighed: 0, factorIds: new Set() });

/** Grammes d'une ligne : g, kg, ou nombre × poids unitaire ; null si inconnu. */
export function lineGrams(line: Pick<RecipeLine, "quantity" | "unit" | "unitWeightG">): number | null {
  return gramsOf(line.quantity, line.unit) ?? (line.unitWeightG != null ? line.quantity * line.unitWeightG : null);
}

/** Poids net d'une sous-recette en grammes (à défaut le poids brut) ; null si inconnu. */
function subRecipeGrams(sub: SubRecipeData): number | null {
  const net = sub.netQuantity != null && sub.netUnit ? gramsOf(sub.netQuantity, sub.netUnit) : null;
  const gross = sub.grossQuantity != null && sub.grossUnit ? gramsOf(sub.grossQuantity, sub.grossUnit) : null;
  return net || gross || null;
}

/** CO2e et couverture d'une liste de lignes (ingrédients et sous-recettes), sous-recettes déroulées. */
export function composition(lines: readonly RecipeLine[], subRecipes: ReadonlyMap<string, SubRecipeData>, factorOf: (key: string) => IngredientFactor, depth = 0): Composition {
  const total = empty();
  for (const line of lines) {
    const grams = lineGrams(line);
    if (grams == null) {
      total.unweighed++;
      continue;
    }
    if (line.isSubRecipe) {
      const sub = line.componentSubRecipeId ? subRecipes.get(line.componentSubRecipeId) : undefined;
      const subGrams = sub ? subRecipeGrams(sub) : null;
      if (!sub || !subGrams || depth >= 5) {
        total.uncoveredG += grams;
        continue;
      }
      const inner = composition(sub.lines, subRecipes, factorOf, depth + 1);
      const share = grams / subGrams;
      total.co2eKg += inner.co2eKg * share;
      total.coveredG += inner.coveredG * share;
      total.uncoveredG += inner.uncoveredG * share;
      total.unweighed += inner.unweighed;
      for (const id of inner.factorIds) total.factorIds.add(id);
      continue;
    }
    const factor = factorOf(line.key);
    if (factor === "non_alimentaire") continue;
    if (factor === "non_couvert") {
      total.uncoveredG += grams;
      continue;
    }
    total.co2eKg += (grams / 1000) * factor.kgCo2ePerKg;
    total.coveredG += grams;
    total.factorIds.add(factor.factorId);
  }
  return total;
}

/** Part du poids des ingrédients couverte par un facteur validé ; 0 sans ingrédient pesé. */
export function coverage(c: Composition): number {
  const weighed = c.coveredG + c.uncoveredG;
  return weighed > 0 ? c.coveredG / weighed : 0;
}

export type Co2Method = "mesure" | "estime" | "non_couvert";

export interface LossCo2 {
  method: Co2Method;
  co2eKg: number;
  /** Kg de la perte répartis selon la couverture (alimentaire seulement ; null si la perte n'a pas de kg). */
  kgMeasured: number;
  kgEstimated: number;
  kgUncovered: number;
  factorIds: string[];
}

const COUNT_UNITS = new Set(["piece", "barquette"]);

/**
 * CO2e d'une perte d'un produit du tome. `perUnit` : CO2e d'une portion (plat) ou d'une pièce comptée ;
 * `perKgOfProduct` : CO2e d'un kg de produit (poids net). Une quantité comptée prend le CO2e par portion, sinon
 * le poids net × CO2e au kg (comme le coût).
 */
export function measuredLoss(
  loss: { netKg: number | null; quantity: number; unitCode: string },
  product: { perUnit: number | null; perKg: number | null; coverage: number; factorIds: Iterable<string> },
): LossCo2 {
  const co2 =
    product.perUnit != null && COUNT_UNITS.has(loss.unitCode)
      ? loss.quantity * product.perUnit
      : loss.netKg != null && product.perKg != null
        ? loss.netKg * product.perKg
        : null;
  const kg = loss.netKg ?? 0;
  if (co2 == null || product.coverage === 0) return { method: "non_couvert", co2eKg: 0, kgMeasured: 0, kgEstimated: 0, kgUncovered: kg, factorIds: [] };
  return {
    method: "mesure",
    co2eKg: roundQuantity(co2),
    kgMeasured: roundQuantity(kg * product.coverage),
    kgEstimated: 0,
    kgUncovered: roundQuantity(kg * (1 - product.coverage)),
    factorIds: [...product.factorIds],
  };
}

/** Perte hors tome : estimation par la famille de son libellé (poids net × facteur), signalée comme telle. */
export function estimatedLoss(netKg: number | null, factor: IngredientFactor | null): LossCo2 {
  const kg = netKg ?? 0;
  if (netKg == null || factor == null || typeof factor === "string") return { method: "non_couvert", co2eKg: 0, kgMeasured: 0, kgEstimated: 0, kgUncovered: kg, factorIds: [] };
  return { method: "estime", co2eKg: roundQuantity(netKg * factor.kgCo2ePerKg), kgMeasured: 0, kgEstimated: kg, kgUncovered: 0, factorIds: [factor.factorId] };
}

export interface FactorVersion {
  id: string;
  familyId: string;
  kgCo2ePerKg: number;
  validatedAt: Date;
  closedAt: Date | null;
}

/**
 * Version du facteur d'une famille à appliquer à une perte : celle en vigueur à la date de la perte ; pour une
 * perte antérieure à la première validation, la première version validée. Une nouvelle version ne réécrit donc
 * jamais le CO2e des pertes passées (décision du 12/11/2026).
 */
export function factorAt(versions: readonly FactorVersion[], date: string): FactorVersion | null {
  const sorted = [...versions].sort((a, b) => a.validatedAt.getTime() - b.validatedAt.getTime());
  const inForce = sorted.filter((v) => toProductionLocalDate(v.validatedAt) <= date).at(-1);
  return inForce ?? sorted[0] ?? null;
}
