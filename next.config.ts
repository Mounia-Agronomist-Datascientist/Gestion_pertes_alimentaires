import type { NextConfig } from "next";

/** En-têtes de sécurité appliqués à toutes les pages (docs/SECURITE.md §5). */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Développement seulement : ouvrir le serveur local depuis un téléphone ou une tablette du même réseau wifi
  // (adresse « Network » affichée au lancement, ex. http://192.168.1.20:3001).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker de la saisie hors ligne : toujours relu, pour qu'une nouvelle version s'installe.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }] },
    ];
  },
};

export default nextConfig;
