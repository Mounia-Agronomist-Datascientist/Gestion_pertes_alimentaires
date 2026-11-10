"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { cancelDeclaration, DeclarationError, setRecoveredAmounts } from "@/modules/declarations/service";

export interface CancelState {
  error?: string;
}

export async function cancelAction(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  try {
    await cancelDeclaration(db, user, id, {
      reason: String(formData.get("reason") ?? ""),
      expectedRevision: Number(formData.get("revision")),
    });
  } catch (e) {
    if (e instanceof DeclarationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  redirect(`/historique/${id}?annulee=1`);
}

export interface RecoveredState {
  error?: string;
}

/** Saisie ou complément des montants encaissés pour les lignes de vente (docs/PHASE3.md, étape 3.5). */
export async function recoveredAction(_prev: RecoveredState, formData: FormData): Promise<RecoveredState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const amounts: Record<string, number | null> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("montant_")) continue;
    const text = String(value).trim().replace(",", ".");
    const amount = text === "" ? null : Number(text);
    if (amount != null && !Number.isFinite(amount)) return { error: "Montant invalide" };
    amounts[key.slice("montant_".length)] = amount;
  }
  try {
    await setRecoveredAmounts(db, user, id, { expectedRevision: Number(formData.get("revision")), amounts });
  } catch (e) {
    if (e instanceof DeclarationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  redirect(`/historique/${id}?recette=1`);
}
