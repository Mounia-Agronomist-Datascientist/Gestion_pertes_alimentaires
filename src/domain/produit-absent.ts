/**
 * Produit absent de la liste, saisi à la main (décisions du 20/11/2026) :
 * - en Stockage, seulement une matière première ou un encas (les sous-recettes, recettes, produits finis,
 *   consommables et plats à gratin concernent la cuisine et le conditionnement) ;
 * - un prix d'achat facultatif (€/kg ou €/pièce), à la saisie ou après coup, pour chiffrer la perte.
 */
import type { PRODUCT_CATEGORIES } from "@/modules/declarations/input";

type Category = (typeof PRODUCT_CATEGORIES)[number];

const BY_ZONE: Record<string, readonly Category[]> = {
  STOCKAGE: ["matiere_premiere", "produit_externe"],
};

/** Types proposés pour un produit absent de la liste, dans ce lieu (tous, sauf règle de la zone). */
export function freeCategoriesFor(zoneCode: string, all: readonly Category[]): Category[] {
  const allowed = BY_ZONE[zoneCode];
  return allowed ? all.filter((c) => allowed.includes(c)) : [...all];
}

export interface FreePrice {
  amountEur: number;
  per: "kg" | "piece";
}

/** Prix d'achat d'un produit absent de la liste, en coût unitaire (au kg ou à la pièce). */
export const freeUnitCost = (p: FreePrice) => ({
  perKgEur: p.per === "kg" ? p.amountEur : null,
  perUnitEur: p.per === "piece" ? p.amountEur : null,
});
