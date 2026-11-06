"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { readSessionToken, requireUser } from "@/modules/auth/next-session";
import { PasswordPolicyError } from "@/modules/auth/password";
import { changePassword, InvalidCurrentPasswordError } from "@/modules/auth/service";

export interface PasswordState {
  error?: string;
}

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "Les deux nouveaux mots de passe ne correspondent pas." };

  try {
    await changePassword(db, user.id, { current, next }, (await readSessionToken()) ?? undefined);
  } catch (e) {
    if (e instanceof PasswordPolicyError || e instanceof InvalidCurrentPasswordError) return { error: e.message };
    throw e;
  }
  redirect("/?mot-de-passe=ok");
}
