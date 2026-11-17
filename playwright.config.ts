import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout (docs/PLAN_TESTS.md §6) : l'application construite pour la production, sur une base dédiée
 * (*_e2e, préparée par scripts/e2e-setup.ts), pilotée dans Chrome au format d'une tablette Android.
 * Lancement : npm run test:e2e (E2E_DATABASE_URL, par défaut la base locale pertes_e2e).
 */
const PORT = 3100;
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgres://localhost:5432/pertes_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  // Une seule base partagée : les parcours s'enchaînent sans se marcher dessus.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Galaxy Tab S4"],
    channel: "chrome",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx tsx scripts/e2e-setup.ts && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/connexion`,
    env: { DATABASE_URL: databaseUrl },
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
