/**
 * Protection contre l'envoi d'un formulaire depuis un autre site (CSRF) : l'en-tête Origin, envoyé par les
 * navigateurs sur les POST, doit correspondre à l'hôte de l'application.
 */
export function isSameOrigin(request: { headers: Headers; url: string }): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // anciens navigateurs : le cookie SameSite=Lax protège déjà la session
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
