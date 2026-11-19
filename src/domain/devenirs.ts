/**
 * Devenirs proposés selon la zone (décision du 19/11/2026) :
 * - « Retour fournisseur » seulement en Réception (un produit qui repart chez le fournisseur, hors du total perdu) ;
 * - pas de « Réutilisation dans une autre préparation » en Réception ;
 * - « Autre destination » demande un commentaire qui la précise.
 */
export function destinationAllowedIn(kind: string, zoneCode: string): boolean {
  if (kind === "retour_fournisseur") return zoneCode === "RECEPTION";
  if (kind === "reutilisation") return zoneCode !== "RECEPTION";
  return true;
}

/** Une destination « Autre » demande un commentaire. */
export const commentRequiredFor = (kinds: readonly string[]) => kinds.includes("autre");
