// Vérifie la connexion à la base et affiche la version de PostgreSQL.
import "dotenv/config";

const { sqlClient } = await import("../src/db/client");
const [row] = await sqlClient`select version()`;
console.log("Connexion OK :", row?.version);
await sqlClient.end();
