// Évalue les alertes « rien de noté ». À planifier chaque jour en production (ex. 22h, après l'équipe H).
// Usage : npm run alertes:evaluer
import "dotenv/config";

const { db, sqlClient } = await import("../src/db/client");
const { alertsStartDateFromEnv, evaluateMissingDeclarations } = await import("../src/modules/alertes/service");
const startDate = alertsStartDateFromEnv();
if (!startDate) console.warn("ALERTES_DEBUT n'est pas défini : aucune alerte n'est évaluée.");
const result = await evaluateMissingDeclarations(db, { startDate });
console.log(`Alertes créées : ${result.created} ; régularisées : ${result.regularized}.`);
await sqlClient.end();
