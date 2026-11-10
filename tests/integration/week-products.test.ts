import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

// S45-2026 : jeudi 29/10 → mercredi 04/11. Lundi 02/11 : la semaine en cours.
const NOW = new Date("2026-11-02T14:00:00Z");
const DAY = "2026-11-02";

describe("saisie à partir des produits de la semaine", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamD: AuthUser;
  let ref: Record<string, string>;
  let catalog: Awaited<ReturnType<typeof weekCatalogs>>;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    const teamDId = await id(t.db.select().from(s.teams).where(eq(s.teams.letter, "D")));
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamD = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: teamDId, password: "mot-de-passe-equipe" }));
    await saveWeekImport(t.db, admin, {
      preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())),
      tomeFileName: "tome.pdf",
      planFileName: "plan.xlsx",
      planSheetName: "S45",
    });
    ref = {
      cuisine: await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE"))),
      conditionnement: await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CON_BARQUETTES"))),
      cause: await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION"))),
      condCause: await id(t.db.select().from(s.causes).where(eq(s.causes.code, "CON_SCELLAGE"))),
      compost: await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES"))),
    };
    catalog = await weekCatalogs(t.db, teamD, DAY);
  });

  afterAll(async () => {
    await t.close();
  });

  const declare = (user: AuthUser, product: object, extra: Record<string, unknown> = {}) =>
    createDeclaration(
      t.db,
      user,
      {
        occurredOn: DAY,
        subzoneId: ref.cuisine,
        product,
        method: "comptage",
        quantity: 10,
        unitCode: "barquette",
        causeId: ref.cause,
        destinations: [{ destinationId: ref.compost, quantity: 10 }],
        ...extra,
      },
      NOW,
    );
  const dish = (code: string) => catalog[0]!.dishes.find((d) => d.code === code)!;

  it("une équipe voit ses plats de la semaine, avec leurs sous-recettes et ingrédients", () => {
    expect(catalog.map((c) => `S${c.number}`)).toEqual(["S45"]);
    expect(catalog[0]!.dishes.map((d) => d.code)).toEqual(["FB04", "PJ02", "PJ09", "QD01", "QD04", "VI01", "VI06", "VI12"]);
    const vi01 = dish("VI01");
    expect(vi01.lines.map((l) => l.label)).toContain("Viande: Haut de cuisse de poulet rôti nature");
    const chicken = vi01.lines.find((l) => l.label.startsWith("Viande"))!;
    expect(catalog[0]!.subRecipes[chicken.subRecipeId!]?.lines.length).toBeGreaterThan(0);
  });

  it("des barquettes perdues d'un plat de l'équipe sont converties avec le poids d'une portion", async () => {
    const r = await declare(teamD, { weekItem: { kind: "plat", id: dish("VI01").id } });
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, r.id));
    expect(row).toMatchObject({
      productName: "Haut de cuisse de poulet rôti, jus au thym, légumes vapeur et semoule de chou-fleur",
      productCode: "VI01",
      productCategory: "produit_fini",
      productUnlisted: false,
      weekRecipeId: dish("VI01").id,
      netKg: 3.151,
      kgStatus: "converti",
      // Coût du tome S45 figé : 1,33 € la portion, soit 10 × 1,33 €.
      costPerUnitEur: 1.33,
      costPerKgEur: 4.2209,
      costImportId: expect.any(String),
    });
    expect(row?.materialCostEur).toBeCloseTo(13.3, 2);
  });

  it("un produit hors liste n'a pas de coût (jamais deviné)", async () => {
    const r = await declare(teamD, { freeLabel: "Produit sans coût", category: "sous_recette" }, { method: "pesee", unitCode: "kg" });
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, r.id));
    expect(row).toMatchObject({ costPerKgEur: null, costPerUnitEur: null, materialCostEur: null, costImportId: null });
  });

  it("une sous-recette pesée et un ingrédient compté (poids unitaire du tome)", async () => {
    const chicken = dish("VI01").lines.find((l) => l.label.startsWith("Viande"))!;
    const sub = await declare(teamD, { weekItem: { kind: "sous_recette", id: chicken.subRecipeId! } }, { method: "pesee", quantity: 2.5, unitCode: "kg", destinations: [{ destinationId: ref.compost, quantity: 2.5 }] });
    const [subRow] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, sub.id));
    expect(subRow).toMatchObject({ productCategory: "sous_recette", weekSubRecipeId: chicken.subRecipeId, netKg: 2.5 });
    const subCost = catalog[0]!.subRecipes[chicken.subRecipeId!]!.cost.perKgEur!;
    expect(subRow?.costPerKgEur).toBe(subCost);
    expect(subRow?.materialCostEur).toBeCloseTo(2.5 * subCost, 3);

    const ingredient = Object.values(catalog[0]!.subRecipes)
      .flatMap((sr) => sr.lines)
      .find((l) => !l.subRecipeId && l.unitWeightG != null)!;
    const ing = await declare(teamD, { weekItem: { kind: "ingredient", id: ingredient.id } }, { unitCode: "piece" });
    const [ingRow] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, ing.id));
    expect(ingRow).toMatchObject({ productCategory: "matiere_premiere", weekLineId: ingredient.id, kgStatus: "converti" });
    expect(ingRow?.netKg).toBeCloseTo((10 * ingredient.unitWeightG!) / 1000, 3);
  });

  it("refuse le plat d'une autre équipe et un encas en cuisine ; accepte l'encas en conditionnement", async () => {
    const adminCatalog = await weekCatalogs(t.db, admin, DAY);
    const other = adminCatalog[0]!.dishes.find((d) => d.code === "FB02")!; // équipe A
    await expect(declare(teamD, { weekItem: { kind: "plat", id: other.id } })).rejects.toThrow(/pas produit par cette équipe/);
    const snack = adminCatalog[0]!.dishes.find((d) => d.code === "EN02_EQ")!;
    expect(snack.snack).toBe(true);
    await expect(declare(teamD, { weekItem: { kind: "plat", id: snack.id } })).rejects.toThrow(/conditionnement, réception ou stockage/);
    const r = await declare(admin, { weekItem: { kind: "plat", id: snack.id } }, { subzoneId: ref.conditionnement, causeId: ref.condCause, unitCode: "piece" });
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, r.id));
    expect(row).toMatchObject({ productCategory: "produit_externe", productCode: "EN02_EQ", teamId: null, netKg: 2.5 });
  });

  it("un moule du tome est déclaré dans la catégorie « Moules et plats à gratin », sans conversion en kg", async () => {
    const all = await weekCatalogs(t.db, admin, DAY);
    const mould = Object.values(all[0]!.subRecipes)
      .flatMap((sr) => sr.lines)
      .find((l) => l.mould && !l.subRecipeId)!;
    const r = await declare(admin, { weekItem: { kind: "ingredient", id: mould.id } }, { subzoneId: ref.conditionnement, causeId: ref.condCause, unitCode: "piece" });
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, r.id));
    expect(row).toMatchObject({ productCategory: "moule_plat_gratin", kgStatus: "sans_objet", netKg: null });
  });

  it("refuse un produit d'une autre semaine que celle de la perte", async () => {
    await expect(
      declare(teamD, { weekItem: { kind: "plat", id: dish("VI01").id } }, { occurredOn: "2026-10-28" }),
    ).rejects.toThrow(/semaine de la perte/);
  });

  it("le compte équipe ne reçoit que ses plats ; l'administration reçoit tout, encas compris", async () => {
    const all = await weekCatalogs(t.db, admin, DAY);
    expect(all[0]!.dishes).toHaveLength(82);
    expect(all[0]!.dishes.filter((d) => d.snack)).toHaveLength(22);
    const [week] = await t.db.select().from(s.productionWeeks).where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 46)));
    expect(await weekCatalogs(t.db, teamD, week!.startDate)).toHaveLength(1); // S46 sans import : S45 reste proposée (déclarations tardives)
  });
});
