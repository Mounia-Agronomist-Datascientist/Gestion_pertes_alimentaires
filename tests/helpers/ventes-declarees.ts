import { inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Remet Too Good To Go et la vente flash dans la saisie des équipes, comme avant le 13/11/2026 : depuis, leurs
 * chiffres viennent des fichiers de l'entreprise (docs/PHASE5.md, étape 5.8). Les tests des ventes déclarées et
 * de leurs recettes (historique) en ont besoin.
 */
export async function allowDeclaredSales(db: Db) {
  await db.update(s.destinations).set({ declarable: true }).where(inArray(s.destinations.code, ["TGTG", "VENTE_FLASH"]));
}
