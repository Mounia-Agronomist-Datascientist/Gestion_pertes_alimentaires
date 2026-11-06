// Remet à zéro la base de DÉVELOPPEMENT (schéma supprimé puis recréé par les migrations et le seed).
// Refuse de s'exécuter si la base n'est pas une base de développement.
import "dotenv/config";

const url = process.env.DATABASE_URL ?? "";
const dbName = new URL(url).pathname.slice(1);
if (process.env.NODE_ENV === "production" || !dbName.endsWith("_dev")) {
  console.error(`Refusé : « ${dbName} » n'est pas une base de développement (nom en *_dev attendu).`);
  process.exit(1);
}

const { sqlClient } = await import("../src/db/client");
await sqlClient.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
console.log(`Base ${dbName} vidée.`);
await sqlClient.end();
