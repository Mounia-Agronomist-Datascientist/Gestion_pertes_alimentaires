/** Déconnexion par formulaire classique (POST) : session supprimée en base, cookie effacé sur la redirection. */
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { isSameOrigin } from "@/modules/auth/same-origin";
import { logout } from "@/modules/auth/service";
import { SESSION_COOKIE } from "@/modules/auth/session-cookie";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse("Origine refusée", { status: 403 });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await logout(db, token);
  const response = NextResponse.redirect(new URL("/connexion", request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
