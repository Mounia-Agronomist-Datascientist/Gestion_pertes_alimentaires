// Initialise les référentiels (idempotent). Usage : npm run db:seed
import "dotenv/config";

const { db, sqlClient } = await import("../src/db/client");
const { seed } = await import("../src/db/seed/seed");
await seed(db);
console.log("Référentiels initialisés.");
await sqlClient.end();
