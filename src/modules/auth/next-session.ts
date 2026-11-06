/**
 * Liaison entre le module d'authentification et Next.js (cookie de session).
 * À n'utiliser que côté serveur.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import type { AuthUser } from "./permissions";
import { validateSession } from "./service";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "./session-cookie";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Utilisateur connecté (une seule lecture en base par requête). */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const session = await validateSession(db, token);
  return session?.user ?? null;
});

/** Exige une session valide, sinon renvoie vers la page de connexion. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}
