// Prépare la base des tests de bout en bout (docs/PLAN_TESTS.md §6) : schéma vidé, migrations, référentiels, comptes
// de test aux mots de passe tirés au hasard (écrits dans node_modules/.cache/, jamais commités).
// Refuse de s'exécuter si la base n'est pas une base de test (nom en *_e2e).
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "";
const dbName = url ? new URL(url).pathname.slice(1) : "";
if (!dbName.endsWith("_e2e")) {
  console.error(`Refusé : « ${dbName} » n'est pas une base de tests de bout en bout (nom en *_e2e attendu).`);
  process.exit(1);
}

const { db, sqlClient } = await import("../src/db/client");
const { migrate } = await import("drizzle-orm/postgres-js/migrator");
const { eq } = await import("drizzle-orm");
const s = await import("../src/db/schema");
const { seed } = await import("../src/db/seed/seed");
const { createAccount } = await import("../src/modules/auth/accounts");

await sqlClient.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await migrate(db, { migrationsFolder: "src/db/migrations" });
await seed(db);

const teamId = async (letter: string) => (await db.select().from(s.teams).where(eq(s.teams.letter, letter)))[0]!.id;
const password = () => `${randomBytes(12).toString("base64url")}-Aa1`;
const accounts = {
  admin: { login: "e2e-admin", password: password() },
  equipeC: { login: "e2e-equipe-c", password: password() },
  equipeA: { login: "e2e-equipe-a", password: password() },
};
await createAccount(db, { login: accounts.admin.login, displayName: "Administration (tests)", roleCode: "admin", password: accounts.admin.password, mustChangePassword: false });
await createAccount(db, { login: accounts.equipeC.login, displayName: "Équipe C (tests)", roleCode: "equipe", teamId: await teamId("C"), password: accounts.equipeC.password, mustChangePassword: false });
await createAccount(db, { login: accounts.equipeA.login, displayName: "Équipe A (tests)", roleCode: "equipe", teamId: await teamId("A"), password: accounts.equipeA.password, mustChangePassword: false });

mkdirSync("node_modules/.cache", { recursive: true });
writeFileSync("node_modules/.cache/e2e-accounts.json", JSON.stringify(accounts));
console.log(`Base ${dbName} prête : référentiels et 3 comptes de test.`);
await sqlClient.end();
