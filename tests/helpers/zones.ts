import * as s from "@/db/schema";
import type { Db } from "@/db/types";

/** Toutes les zones : pour un compte de test qui saisit partout (une équipe n'a que Cuisine/production par défaut). */
export async function allZoneIds(db: Db): Promise<string[]> {
  return (await db.select({ id: s.zones.id }).from(s.zones)).map((z) => z.id);
}
