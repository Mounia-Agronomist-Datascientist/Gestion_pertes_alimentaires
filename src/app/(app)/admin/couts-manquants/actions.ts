"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { completeMissingCosts, DeclarationError } from "@/modules/declarations/service";

export interface CompleteCostsState {
  error?: string;
  message?: string;
}

/** Complète le coût des pertes qui n'en avaient pas (décision du 26/11/2026). */
export async function completeCostsAction(): Promise<CompleteCostsState> {
  const user = await requireUser();
  try {
    const { completed, remaining } = await completeMissingCosts(db, user);
    revalidatePath("/admin/couts-manquants");
    revalidatePath("/couts");
    revalidatePath("/statistiques");
    return {
      message:
        completed === 0
          ? "Aucun coût n'a pu être complété : il manque encore un prix ou le tome de la semaine."
          : `${completed} perte${completed > 1 ? "s" : ""} complétée${completed > 1 ? "s" : ""}${
              remaining ? ` ; ${remaining} toujours sans coût (prix ou tome manquant)` : ""
            }.`,
    };
  } catch (e) {
    if (e instanceof DeclarationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
