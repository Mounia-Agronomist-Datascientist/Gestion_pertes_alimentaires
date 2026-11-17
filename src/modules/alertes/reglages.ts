/** Seuils des alertes d'analyse et des tendances (docs/PHASE6.md), enregistrés en base (`alert_settings`). */
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type AlertSettings, DEFAULT_ALERT_SETTINGS } from "@/domain/pertes-inhabituelles";

export async function loadAlertSettings(db: Db): Promise<AlertSettings> {
  const [row] = await db.select().from(s.alertSettings).where(eq(s.alertSettings.id, 1));
  return row ? { unusualRate: row.unusualRate, minKg: row.minKg, recurrenceWeeks: row.recurrenceWeeks, trendStableRate: row.trendStableRate } : DEFAULT_ALERT_SETTINGS;
}
