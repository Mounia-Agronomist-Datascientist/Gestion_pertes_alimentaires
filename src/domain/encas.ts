/**
 * Lieux des encas au Stockage (décision du 23/11/2026) : un encas n'est proposé que là où il est rangé.
 * - « Local encas frais » : les yaourts et les fromages ;
 * - « Stockage sec - ENCAS » : tous les autres encas ;
 * - un encas sans famille (saisi à la main, ou arrivé d'un bon de commande) : dans les deux lieux d'encas, jusqu'à ce
 *   que l'administration lui donne sa famille (fiche produit) ;
 * - autres lieux du Stockage : aucun encas.
 * En Réception et en Conditionnement, tous les encas restent proposés.
 */
export const FRESH_SNACK_FAMILIES: readonly string[] = ["yaourts", "fromages"];
export const FRESH_SNACK_SUBZONE = "STO_ENCAS_FRAIS";
export const DRY_SNACK_SUBZONE = "STO_SEC_ENCAS";

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

export const isFreshSnack = (family: string | null | undefined) =>
  !!family && FRESH_SNACK_FAMILIES.includes(fold(family));

/** Encas proposé dans ce lieu ? */
export function snackAllowedIn(zoneCode: string, subzoneCode: string | null | undefined, family: string | null) {
  if (zoneCode !== "STOCKAGE") return true;
  if (!family?.trim()) return subzoneCode === FRESH_SNACK_SUBZONE || subzoneCode === DRY_SNACK_SUBZONE;
  if (subzoneCode === FRESH_SNACK_SUBZONE) return isFreshSnack(family);
  if (subzoneCode === DRY_SNACK_SUBZONE) return !isFreshSnack(family);
  return false;
}
