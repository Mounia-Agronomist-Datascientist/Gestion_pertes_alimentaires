/**
 * Connexion par formulaire classique (POST) : le cookie de session est posé sur une redirection 303 ordinaire.
 * Remplace l'action serveur, dont le cookie n'était pas enregistré par le navigateur une fois l'application
 * hébergée sur Netlify (chaque page redemandait la connexion, constaté le 10/11/2026).
 */
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionCookieOptions } from "@/modules/auth/next-session";
import { login } from "@/modules/auth/service";
import { SESSION_COOKIE } from "@/modules/auth/session-cookie";
import { isSameOrigin } from "@/modules/auth/same-origin";

const back = (request: NextRequest, path: string) => NextResponse.redirect(new URL(path, request.url), 303);

export async function POST(request: NextRequest) {
  // Le formulaire ne peut être envoyé que depuis l'application elle-même.
  if (!isSameOrigin(request)) return new NextResponse("Origine refusée", { status: 403 });

  const form = await request.formData();
  const loginName = String(form.get("login") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const retry = (error: "vide" | "incorrect" | "bloque") =>
    back(request, `/connexion?${new URLSearchParams({ erreur: error, ...(loginName ? { login: loginName } : {}) })}`);
  if (!loginName || !password) return retry("vide");

  const result = await login(
    db,
    { login: loginName, password },
    { ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: request.headers.get("user-agent") },
  );
  if (!result.ok) return retry(result.reason === "locked" ? "bloque" : "incorrect");

  const response = back(request, result.user.mustChangePassword ? "/mot-de-passe" : "/");
  response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
