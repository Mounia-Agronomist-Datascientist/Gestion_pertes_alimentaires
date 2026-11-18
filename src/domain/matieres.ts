/**
 * Règles du référentiel des matières premières (docs/PHASE6.md, étape 6.7), sans base de données.
 */
import { gramsOf, ingredientUnitCost, type UnitCost } from "./couts";

export interface TomeIngredientLine {
  label: string;
  key: string;
  quantity: number;
  unit: string;
  unitWeightG: number | null;
  costEur: number | null;
}

export interface TomeMaterial {
  key: string;
  /** Libellé du tome (sans la mention « (sous-recette) »). */
  name: string;
  unit: string;
  unitWeightG: number | null;
  cost: UnitCost;
}

const MELBA_PREFIX = "melba:";
/** Identifiant externe d'une matière Melba : la clé de rapprochement du tome. */
export const melbaExternalId = (key: string) => `${MELBA_PREFIX}${key}`;
export const isMelbaExternalId = (externalId: string | null | undefined) => !!externalId?.startsWith(MELBA_PREFIX);

/**
 * Une matière par clé : parmi les lignes d'un tome, la ligne qui donne le prix le plus sûr — d'abord une ligne
 * pesée (g, kg) avec un coût, puis celle qui porte la plus grande quantité (l'arrondi du coût pèse moins).
 */
export function tomeMaterials(lines: readonly TomeIngredientLine[]): TomeMaterial[] {
  const best = new Map<string, TomeIngredientLine>();
  const rank = (l: TomeIngredientLine) => [l.costEur != null && l.quantity > 0 ? 1 : 0, gramsOf(1, l.unit) != null ? 1 : 0, l.quantity] as const;
  const better = (a: TomeIngredientLine, b: TomeIngredientLine) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! > rb[i]!;
    return false;
  };
  for (const line of lines) {
    if (!line.key) continue;
    const current = best.get(line.key);
    if (!current || better(line, current)) best.set(line.key, line);
  }
  return [...best.values()]
    .map((l) => ({
      key: l.key,
      name: l.label.replace(/\s*\(\s*sous[\s-]*recettes?\s*\)\s*/i, " ").trim(),
      unit: l.unit.trim(),
      unitWeightG: l.unitWeightG,
      cost: ingredientUnitCost(l),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface PriceVersion {
  source: "tome" | "bon_commande" | "manuel";
  validFrom: string;
  unit: string | null;
  unitWeightG: number | null;
  perKgEur: number | null;
  perUnitEur: number | null;
}

/**
 * Écart de prix sous lequel un tome ne crée pas de nouvelle version : le coût d'une ligne est imprimé au centime,
 * le prix au kg qu'on en tire varie de quelques millièmes d'une semaine à l'autre sans que le prix ait changé.
 */
export const PRICE_TOLERANCE = 0.005;

const close = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? (a ?? null) === (b ?? null) : a === b || Math.abs(a - b) <= PRICE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));

/** Même unité et même prix (à l'arrondi du tome près) : pas de nouvelle version. */
export const samePrice = (a: Omit<PriceVersion, "source" | "validFrom">, b: Omit<PriceVersion, "source" | "validFrom">) =>
  (a.unit ?? null) === (b.unit ?? null) &&
  (a.unitWeightG ?? null) === (b.unitWeightG ?? null) &&
  close(a.perKgEur, b.perKgEur) &&
  close(a.perUnitEur, b.perUnitEur);

/**
 * Prix en vigueur à une date (décision du 17/11/2026) : le dernier prix d'achat (bon de commande) ou la dernière
 * correction manuelle, à défaut le dernier coût du tome. Seules les versions commencées à cette date comptent.
 */
export function priceInForce<V extends PriceVersion>(versions: readonly V[], on: string): V | null {
  const started = versions.filter((v) => v.validFrom <= on);
  const latest = (list: V[]) => list.reduce<V | null>((acc, v) => (!acc || v.validFrom > acc.validFrom || (v.validFrom === acc.validFrom && v.source === "manuel") ? v : acc), null);
  return latest(started.filter((v) => v.source !== "tome")) ?? latest(started.filter((v) => v.source === "tome"));
}

/**
 * Matières de la semaine proposées à un lieu de saisie (docs/PHASE6.md, étape 6.10) :
 * - Réception : toutes, la marchandise arrive avant d'être rangée ;
 * - Stockage : celles rangées dans cette sous-zone — lieu propre au produit (étape 6.11), sinon celui de sa catégorie
 *   Melba ; à part, celles dont le lieu n'est pas encore réglé (ni lieu propre, ni catégorie rangée). Les autres se
 *   trouvent par la recherche.
 */
export function materialsForPlace<M extends { categoryId: string | null; storageSubzoneId?: string | null }>(
  materials: readonly M[],
  storageOf: ReadonlyMap<string, string | null>,
  place: { zoneCode: string; subzoneId: string },
): { here: M[]; unplaced: M[] } {
  if (place.zoneCode !== "STOCKAGE") return { here: [...materials], unplaced: [] };
  const here: M[] = [];
  const unplaced: M[] = [];
  for (const m of materials) {
    const storage = m.storageSubzoneId ?? (m.categoryId ? (storageOf.get(m.categoryId) ?? null) : null);
    if (storage === place.subzoneId) here.push(m);
    else if (storage == null) unplaced.push(m);
  }
  return { here, unplaced };
}
