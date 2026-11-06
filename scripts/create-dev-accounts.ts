// Crée les comptes de DÉVELOPPEMENT (8 équipes, 4 responsables de zone, 1 administrateur).
// Les mots de passe générés sont écrits dans comptes-dev.local.md (ignoré par git), jamais affichés.
// Un compte existant n'est pas modifié. Les comptes de production seront créés depuis l'administration.
import "dotenv/config";
import { writeFileSync, existsSync, appendFileSync } from "node:fs";

const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (process.env.NODE_ENV === "production" || !dbName.endsWith("_dev")) {
  console.error(`Refusé : « ${dbName} » n'est pas une base de développement.`);
  process.exit(1);
}

const { db, sqlClient } = await import("../src/db/client");
const schema = await import("../src/db/schema");
const { accountExists, createAccount } = await import("../src/modules/auth/accounts");
const { generatePassword } = await import("../src/modules/auth/password");

const teams = await db.select().from(schema.teams).orderBy(schema.teams.displayOrder);
const zones = await db.select().from(schema.zones);
const zoneId = (code: string) => zones.find((z) => z.code === code)!.id;

const accounts = [
  ...teams.map((t) => ({
    login: `equipe-${t.letter.toLowerCase()}`,
    displayName: `Chef d'équipe – Équipe ${t.colorName} (${t.letter})`,
    roleCode: "equipe",
    teamId: t.id,
  })),
  { login: "resp-reception", displayName: "Responsable Réception", roleCode: "resp_zone", zoneIds: [zoneId("RECEPTION")] },
  { login: "resp-stockage", displayName: "Responsable Stockage", roleCode: "resp_zone", zoneIds: [zoneId("STOCKAGE")] },
  { login: "resp-conditionnement", displayName: "Responsable Conditionnement", roleCode: "resp_zone", zoneIds: [zoneId("CONDITIONNEMENT")] },
  { login: "resp-plonge", displayName: "Responsable Plonge", roleCode: "resp_zone", zoneIds: [zoneId("PLONGE")] },
  { login: "admin", displayName: "Administration", roleCode: "admin" },
];

const file = "comptes-dev.local.md";
if (!existsSync(file)) {
  writeFileSync(file, "# Comptes de développement (fichier local, ne pas partager)\n\n| Identifiant | Mot de passe |\n|---|---|\n");
}
let created = 0;
for (const account of accounts) {
  if (await accountExists(db, account.login)) continue;
  const password = generatePassword();
  await createAccount(db, { ...account, password, mustChangePassword: false });
  appendFileSync(file, `| ${account.login} | ${password} |\n`);
  created++;
}
console.log(`${created} compte(s) créé(s) ; identifiants dans ${file}.`);
await sqlClient.end();
