import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL n'est pas défini (voir .env.example)");
}

/** Vérifie le format sans jamais afficher l'adresse dans l'erreur : elle contient le mot de passe. */
function parseDatabaseUrl(value: string): URL {
  const invalid = new Error("DATABASE_URL doit commencer par postgresql:// (sans guillemets, espace ni texte avant)");
  if (!/^postgres(ql)?:\/\//.test(value)) throw invalid;
  try {
    return new URL(value);
  } catch {
    throw invalid;
  }
}

/**
 * En production (Neon), utiliser l'adresse « poolée » (nom d'hôte contenant « -pooler ») : le
 * regroupeur de connexions ne gère pas les requêtes préparées, désactivées dans ce cas.
 * Les fonctions serverless ouvrent peu de connexions chacune (DB_POOL_MAX).
 */
const pooled = parseDatabaseUrl(url).hostname.includes("-pooler");

export const sqlClient = postgres(url, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
  prepare: !pooled,
  idle_timeout: 20,
  // Notices informatives de PostgreSQL (« déjà existant, ignoré ») : sans intérêt dans les journaux.
  onnotice: () => {},
});
export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
