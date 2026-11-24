/**
 * Parcours de bout en bout (docs/PLAN_TESTS.md §6) : l'application de production pilotée dans Chrome, au format d'une
 * tablette Android, sur la base de test préparée par scripts/e2e-setup.ts.
 */
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

type Account = { login: string; password: string };
const accounts = (): Record<"admin" | "equipeC" | "equipeA", Account> =>
  JSON.parse(readFileSync("node_modules/.cache/e2e-accounts.json", "utf8"));

async function login(page: Page, who: keyof ReturnType<typeof accounts>) {
  const account = accounts()[who];
  await page.goto("/connexion");
  // Logo de La Brigade de Véro : sur la page de connexion seulement.
  await expect(page.getByRole("img", { name: "La Brigade de Véro" })).toBeVisible();
  await page.getByLabel("Identifiant").fill(account.login);
  await page.getByLabel("Mot de passe").fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("img", { name: "La Brigade de Véro" })).toHaveCount(0);
}

/** Répond aux questions de la saisie, de la zone jusqu'au récapitulatif (produit hors liste, pesée). */
async function fillLoss(page: Page, product: string, kg: string, from: "zone" | "product" = "zone") {
  if (from === "zone") {
    await page.getByRole("button", { name: /Cuisine \/ Production/ }).click();
    await page.getByRole("button", { name: /^Cuisine(?! \/)/ }).click();
  }
  await page.getByRole("button", { name: "Produit absent de la liste" }).click();
  await page.getByLabel("Nom du produit").fill(product);
  await page.getByRole("button", { name: "Matière première" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Pesée à la balance/ }).click();
  await page.getByRole("button", { name: /^Poids net/ }).click();
  await page.getByLabel("Quantité", { exact: true }).fill(kg);
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Erreur de déboîtage \/ préparation/ }).click();
  await page.getByRole("button", { name: /^Ordures ménagères/ }).click();
  await expect(page.getByRole("heading", { name: "Vérifier et valider" })).toBeVisible();
}

const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

test("une équipe déclare une perte, la retrouve dans l'historique et la corrige", async ({ page }) => {
  await login(page, "equipeC");
  const product = unique("Carottes");
  await page.getByRole("link", { name: /Déclarer une perte/ }).click();
  await fillLoss(page, product, "1,5");
  await page.getByRole("button", { name: "Valider la perte" }).click();
  await expect(page.getByText("Perte enregistrée")).toBeVisible();
  await expect(page.getByText(/1,5 kg/)).toBeVisible();

  await page.goto("/historique");
  await page.getByRole("link", { name: new RegExp(product) }).click();
  await page.getByRole("link", { name: "Corriger" }).click();
  await expect(page.getByRole("heading", { name: "Vérifier et valider" })).toBeVisible();
  await page.getByPlaceholder("ex. erreur de pesée").fill("Test de correction");
  await page.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(page.getByText("Correction enregistrée")).toBeVisible();
});

test("une équipe déclare deux pertes d'un coup", async ({ page }) => {
  await login(page, "equipeC");
  await page.goto("/declarer/serie");
  await fillLoss(page, unique("Poireaux"), "2");
  await page.getByRole("button", { name: "Ajouter à la liste" }).click();
  await page.getByRole("button", { name: /Ajouter une perte \(même endroit\)/ }).click();
  await fillLoss(page, unique("Courgettes"), "0,8", "product");
  await page.getByRole("button", { name: "Ajouter à la liste" }).click();
  await page.getByRole("button", { name: "Valider les 2 pertes" }).click();
  await expect(page.getByText("2 pertes enregistrées")).toBeVisible();
});

test("une équipe ne voit pas les pertes d'une autre équipe ni l'administration", async ({ page }) => {
  await login(page, "equipeC");
  const product = unique("Céleri");
  await page.goto("/declarer");
  await fillLoss(page, product, "1");
  await page.getByRole("button", { name: "Valider la perte" }).click();
  await expect(page.getByText("Perte enregistrée")).toBeVisible();
  await page.context().clearCookies();

  await login(page, "equipeA");
  await page.goto("/historique?periode=toutes");
  await expect(page.getByRole("heading", { name: "Pertes déclarées" })).toBeVisible();
  await expect(page.getByText(product)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  // Too Good To Go, vente flash et Linkee ne sont plus proposés aux équipes.
  await page.goto("/declarer");
  await page.getByRole("button", { name: /Cuisine \/ Production/ }).click();
  await page.getByRole("button", { name: /^Cuisine(?! \/)/ }).click();
  await page.getByRole("button", { name: "Produit absent de la liste" }).click();
  await page.getByLabel("Nom du produit").fill("Navets");
  await page.getByRole("button", { name: "Matière première" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Pesée à la balance/ }).click();
  await page.getByRole("button", { name: /^Poids net/ }).click();
  await page.getByLabel("Quantité", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Erreur de déboîtage \/ préparation/ }).click();
  await expect(page.getByRole("button", { name: /^Ordures ménagères/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Too Good To Go|Vente flash|Linkee/ })).toHaveCount(0);
});

test("sans réseau, la saisie s'ouvre, la perte est gardée puis envoyée au retour du réseau", async ({
  page,
  context,
}) => {
  await login(page, "equipeC");
  // Premier passage en ligne : le service worker s'installe et garde la page de saisie.
  await page.goto("/declarer");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Où a eu lieu la perte ?" })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Où a eu lieu la perte ?" })).toBeVisible();
  const product = unique("Épinards");
  await fillLoss(page, product, "0,6");
  await page.getByRole("button", { name: "Valider la perte" }).click();
  await expect(page.getByText("Perte gardée sur cet appareil")).toBeVisible();
  await expect(page.getByText(/Hors ligne : les pertes validées sont gardées/)).toBeVisible();
  // Les autres pages ne sont pas disponibles sans réseau.
  await page.goto("/statistiques").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Hors ligne" })).toBeVisible();

  await context.setOffline(false);
  await page.goto("/declarer/en-attente");
  await expect(page.getByText("Aucune perte en attente.")).toBeVisible({ timeout: 30_000 });
  await page.goto("/historique");
  await expect(page.getByRole("link", { name: new RegExp(product) })).toBeVisible();
});

test("l'administration consulte les alertes et règle les seuils", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/alertes/analyse");
  await expect(page.getByRole("heading", { name: "Alertes d'analyse" })).toBeVisible();
  await page.goto("/admin/alertes");
  await expect(page.getByRole("heading", { name: "Seuils des alertes" })).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Seuils enregistrés/)).toBeVisible();
});

test("les répartitions s'affichent en anneau, avec le total au centre et la légende", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/statistiques/causes");
  const donut = page.locator("figure").filter({ has: page.getByRole("img", { name: /Classement des causes/ }) });
  await expect(donut.getByText("au total")).toBeVisible();
  const legend = donut.getByRole("list", { name: "Classement des causes" }).getByRole("listitem").first();
  await expect(legend).toContainText("%");
  // Toucher une ligne (tablette) : la part est mise en avant et son détail s'affiche.
  await expect(async () => {
    await legend.click();
    await expect(legend).toHaveClass(/bg-slate-100/, { timeout: 1000 });
  }).toPass();
  await expect(donut.getByRole("status")).toContainText("Erreur de déboîtage / préparation");
});
