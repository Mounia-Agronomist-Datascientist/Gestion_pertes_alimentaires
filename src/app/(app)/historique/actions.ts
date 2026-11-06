"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { ForbiddenError } from "@/modules/auth/permissions";
import { cancelDeclaration, DeclarationError } from "@/modules/declarations/service";

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
