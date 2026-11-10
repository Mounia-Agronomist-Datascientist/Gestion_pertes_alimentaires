import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/modules/auth/session-cookie";

/**
 * Filtre rapide avant chaque page : sans cookie de session, renvoi vers la connexion.
 * La validité réelle de la session est vérifiée côté serveur par requireUser().
 * Le cookie est prolongé à chaque visite pour suivre l'expiration glissante en base.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = request.nextUrl.pathname.startsWith("/connexion");

  if (!token && !isPublic) {
    const redirect = NextResponse.redirect(new URL("/connexion", request.url));
    // Jamais mis en cache (navigateur ou hébergeur) : la réponse dépend de la session.
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  }

  const response = NextResponse.next();
  if (token) {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
