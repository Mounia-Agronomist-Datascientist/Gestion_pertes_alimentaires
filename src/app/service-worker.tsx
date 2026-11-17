"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (public/sw.js) qui ouvre la saisie des pertes sans réseau (docs/PHASE6.md,
 * étape 6.6). En production seulement : en développement, il garderait d'anciennes versions des fichiers.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Navigateur sans service worker (navigation privée…) : l'application reste utilisable en ligne.
    });
  }, []);
  return null;
}

/**
 * Vide les pages gardées pour la saisie hors ligne (page de connexion : après une déconnexion ou avant un
 * changement de compte). Les pertes en attente d'envoi ne sont pas touchées : elles partiront à la prochaine
 * connexion de leur compte.
 */
export function ClearOfflinePages() {
  useEffect(() => {
    if (!("caches" in window)) return;
    void caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.endsWith("-pages")).map((k) => caches.delete(k))))
      .catch(() => undefined);
  }, []);
  return null;
}
