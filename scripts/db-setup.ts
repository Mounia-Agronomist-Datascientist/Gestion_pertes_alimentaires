// Initialise ou met à jour une base (production comprise) :
//   1. applique les migrations SQL en attente ;
//   2. charge les référentiels initiaux (sans écraser les ajustements de l'administration) ;
//   3. crée le compte administrateur s'il n'existe aucun administrateur, avec le mot de passe
//      provisoire ADMIN_INITIAL_PASSWORD (à changer à la première connexion).
// Ne crée jamais de comptes de test. Usage : npm run db:setup
import "dotenv/config";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const { db, sqlClient } = await import("../src/db/client");
const schema = await import("../src/db/schema");
const { seed } = await import("../src/db/seed/seed");
const { createAccount } = await import("../src/modules/auth/accounts");

await migrate(db, { migrationsFolder: "src/db/migrations" });
console.log("Migrations appliquées.");

await seed(db);
console.log("Référentiels à jour.");

const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.roleCode, "admin"));
if (admins.length === 0) {
  const password = process.env.ADMIN_INITIAL_PASSWORD ?? "";
  if (password.length < 10) {
    console.error("Aucun administrateur : définissez ADMIN_INITIAL_PASSWORD (10 caractères minimum) pour le créer.");
    process.exitCode = 1;
  } else {
    await createAccount(db, { login: "admin", displayName: "Administration", roleCode: "admin", password, mustChangePassword: true });
    console.log("Compte « admin » créé : mot de passe provisoire à changer à la première connexion.");
  }
} else {
  console.log("Un administrateur existe déjà : aucun compte créé.");
}
await sqlClient.end();
