"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { AlertError, cancelAlert } from "@/modules/alertes/service";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";

export interface AlertActionState {
  error?: string;
  message?: string;
}

export async function cancelAlertAction(_prev: AlertActionState, formData: FormData): Promise<AlertActionState> {
  const user = await requireUser();
  try {
    await cancelAlert(db, user, String(formData.get("alertId")), String(formData.get("note") ?? ""));
  } catch (e) {
    if (e instanceof AlertError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/alertes");
  return { message: "Alerte levée : les 150 kg estimés ne sont plus comptés." };
}
