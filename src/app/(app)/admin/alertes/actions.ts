"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { AlertSettingsError, updateAlertSettings } from "@/modules/alertes/consultation";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";

export interface SettingsActionState {
  error?: string;
  message?: string;
}

const number = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".").trim() || NaN);

export async function updateAlertSettingsAction(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const admin = await requireUser();
  try {
    await updateAlertSettings(db, admin, {
      unusualPercent: number(formData.get("unusualPercent")),
      minKg: number(formData.get("minKg")),
      recurrenceWeeks: number(formData.get("recurrenceWeeks")),
      stablePercent: number(formData.get("stablePercent")),
    });
  } catch (e) {
    if (e instanceof AlertSettingsError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/alertes");
  return { message: "Seuils enregistrés. Ils s'appliquent à la prochaine analyse de nuit et aux tendances dès maintenant." };
}
