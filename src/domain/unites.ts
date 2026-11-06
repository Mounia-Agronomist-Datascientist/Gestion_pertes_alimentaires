/**
 * Règle R2 — Unités et conversion en kilogrammes (voir docs/REGLES_METIER.md).
 *
 * - Jamais 1 L = 1 kg par défaut : la densité du produit est obligatoire.
 * - Jamais de poids unitaire inventé : sans lui, la quantité reste dans son unité.
 * - Les consommables ne sont jamais convertis en kg alimentaires.
 */
import { roundQuantity } from "./nombres";

export type UnitKind = "masse" | "volume" | "comptage";

export interface Unit {
  code: string;
  kind: UnitKind;
  /** Vers kg (masse), L (volume) ou 1 (comptage). */
  toBaseFactor: number;
}

export interface ProductConversionData {
  isConsumable: boolean;
  unitWeightKg?: number | null;
  densityKgPerL?: number | null;
}

/** pese : masse saisie ; converti : via densité ou poids unitaire ; non_converti : donnée manquante. */
export type KgStatus = "pese" | "converti" | "non_converti" | "sans_objet";

export interface KgConversion {
  netKg: number | null;
  kgStatus: KgStatus;
  /** Densité ou poids unitaire utilisé, conservé dans la déclaration. */
  factorUsed: number | null;
  /** Explication affichable quand la conversion est impossible. */
  reason?: string;
}

export class QuantityError extends Error {}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new QuantityError("La quantité doit être supérieure à 0");
  }
}

export function convertToKg(quantity: number, unit: Unit, product: ProductConversionData): KgConversion {
  assertPositiveQuantity(quantity);

  if (product.isConsumable) {
    return { netKg: null, kgStatus: "sans_objet", factorUsed: null };
  }

  const baseQuantity = quantity * unit.toBaseFactor;

  switch (unit.kind) {
    case "masse":
      return { netKg: roundQuantity(baseQuantity), kgStatus: "pese", factorUsed: null };

    case "volume":
      if (product.densityKgPerL == null) {
        return {
          netKg: null,
          kgStatus: "non_converti",
          factorUsed: null,
          reason: "Densité inconnue pour ce produit : quantité conservée en volume",
        };
      }
      return {
        netKg: roundQuantity(baseQuantity * product.densityKgPerL),
        kgStatus: "converti",
        factorUsed: product.densityKgPerL,
      };

    case "comptage":
      if (product.unitWeightKg == null) {
        return {
          netKg: null,
          kgStatus: "non_converti",
          factorUsed: null,
          reason: "Poids unitaire inconnu pour ce produit : quantité conservée en unités",
        };
      }
      return {
        netKg: roundQuantity(baseQuantity * product.unitWeightKg),
        kgStatus: "converti",
        factorUsed: product.unitWeightKg,
      };
  }
}
