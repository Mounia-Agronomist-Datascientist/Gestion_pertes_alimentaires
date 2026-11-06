import { and, gte, lte } from "drizzle-orm";
import { productionWeeks } from "@/db/schema";
import type { Db } from "@/db/types";
import type { LocalDate } from "@/domain/semaine-production";

/** Semaine de production contenant `date`, lue dans le calendrier stocké (jamais recalculée). */
export async function findStoredProductionWeek(db: Db, date: LocalDate) {
  const [week] = await db
    .select()
    .from(productionWeeks)
    .where(and(lte(productionWeeks.startDate, date), gte(productionWeeks.endDate, date)));
  return week ?? null;
}
