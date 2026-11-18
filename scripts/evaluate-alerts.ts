// Évalue les alertes : « rien de noté » (chaque jour) et alertes d'analyse des semaines terminées (pertes
// inhabituelles). À planifier chaque jour en production (ex. 22h, après l'équipe H).
// Usage : npm run alertes:evaluer
import "dotenv/config";

const { db, sqlClient } = await import("../src/db/client");
const { alertsStartDateFromEnv, evaluateMissingDeclarations } = await import("../src/modules/alertes/service");
const { evaluateLossAlerts } = await import("../src/modules/alertes/analyse");
const startDate = alertsStartDateFromEnv();
if (!startDate) console.warn("ALERTES_DEBUT n'est pas défini : aucune alerte n'est évaluée.");
const result = await evaluateMissingDeclarations(db, { startDate });
console.log(`Alertes « rien de noté » créées : ${result.created} ; régularisées : ${result.regularized}.`);
const analysis = await evaluateLossAlerts(db, { startDate });
console.log(
  `Alertes d'analyse (${analysis.weeks} semaine(s) revue(s)) : ${analysis.created} créée(s), ${analysis.updated} mise(s) à jour, ${analysis.removed} retirée(s).`,
);
await sqlClient.end();
