/*
 * Service worker de l'application Pertes (docs/PHASE6.md, étape 6.6) : ouvrir la saisie des pertes sans réseau.
 *
 * - Pages de saisie (accueil, une perte, plusieurs pertes, pertes en attente) : réseau d'abord ; la dernière version
 *   reçue est gardée sur l'appareil et servie quand le réseau manque. Elle contient les listes de la semaine
 *   (postes, causes, destinations, plats, tares) telles qu'au dernier passage en ligne.
 * - Fichiers de l'application (/_next/static, nommés par leur contenu) : gardés à la première lecture.
 * - Toute autre page sans réseau : page « hors ligne » avec le lien vers la saisie.
 * - Rien d'autre n'est gardé : ni envois (POST), ni statistiques, ni administration.
 * Le cache est vidé à chaque passage sur la page de connexion (déconnexion, changement de compte) : un appareil
 * partagé ne montre jamais les listes d'un autre compte.
 */
const VERSION = "pertes-v1";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const OFFLINE_PAGES = ["/", "/declarer", "/declarer/serie", "/declarer/en-attente"];
const MAX_STATIC = 300;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "vider-cache") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(STATIC)]));
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(key);
}

const OFFLINE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hors ligne — Pertes</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}main{max-width:40rem;margin:auto;display:flex;flex-direction:column;gap:16px}
a{display:block;text-align:center;background:#280606;color:#fff;padding:14px;border-radius:12px;text-decoration:none;font-weight:600}p{line-height:1.5}</style></head>
<body><main><h1>Hors ligne</h1><p>Cette page n'est pas disponible sans réseau. La saisie des pertes reste possible : elles seront gardées sur cet appareil et envoyées au retour du réseau.</p>
<a href="/declarer">Déclarer une perte</a><a href="/declarer/serie">Déclarer plusieurs pertes</a></main></body></html>`;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          void trim(cache);
        }
        return response;
      })(),
    );
    return;
  }

  if (request.mode !== "navigate") return;
  const offlinePage = OFFLINE_PAGES.includes(url.pathname);
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        // Seule une page de saisie reçue normalement (pas une redirection vers la connexion) est gardée.
        if (offlinePage && response.ok && !response.redirected) {
          const cache = await caches.open(PAGES);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        if (offlinePage) {
          const cached = await (await caches.open(PAGES)).match(url.pathname);
          if (cached) return cached;
        }
        return new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })(),
  );
});
