// Constantes du cookie de session, sans dépendance serveur (utilisables dans proxy.ts).
export const SESSION_COOKIE = "pertes_session";
/** Durée de vie du cookie ; l'expiration réelle est contrôlée en base, selon le rôle. */
export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
