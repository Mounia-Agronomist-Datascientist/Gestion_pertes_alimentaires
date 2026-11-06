"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { setSessionCookie } from "@/modules/auth/next-session";
import { login } from "@/modules/auth/service";

export interface LoginState {
  error?: string;
  login?: string;
}

const schema = z.object({
  login: z.string().trim().min(1, "Saisissez votre identifiant"),
  password: z.string().min(1, "Saisissez votre mot de passe"),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ login: formData.get("login"), password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, login: String(formData.get("login") ?? "") };
  }

  const h = await headers();
  const result = await login(db, parsed.data, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });

  if (!result.ok) {
    return {
      login: parsed.data.login,
      error:
        result.reason === "locked"
          ? "Trop d'essais : ce compte est bloqué pendant 15 minutes."
          : "Identifiant ou mot de passe incorrect.",
    };
  }

  await setSessionCookie(result.token);
  redirect(result.user.mustChangePassword ? "/mot-de-passe" : "/");
}
