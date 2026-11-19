import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createProduct, setProductActive, updateProduct } from "@/modules/admin/products";
import { createAccount } from "@/modules/auth/accounts";
import { allZoneIds } from "../helpers/zones";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { buildWeekImport, type WeekImportPreview } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { findWeekItem } from "@/modules/imports/catalog";
import { buildMaterialsFromTomes, materialPriceAt } from "@/modules/matieres/referentiel";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

// S45-2026 : jeudi 29/10 → mercredi 04/11 ; S46 : jeudi 05/11 → mercredi 11/11.
const S45 = "2026-10-29";
const S46 = "2026-11-05";
const NOW = new Date("2026-11-06T14:00:00Z");

describe("référentiel des matières premières tiré des tomes", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamD: AuthUser;
  let s45: WeekImportPreview;
  const melba = () => t.db.select().from(s.products).where(like(s.products.externalId, "melba:%"));
  const byKey = async (key: string) =>
    (
      await t.db
        .select()
        .from(s.products)
        .where(eq(s.products.externalId, `melba:${key}`))
    )[0]!;
  const pricesOf = (productId: string) =>
    t.db.select().from(s.productPrices).where(eq(s.productPrices.productId, productId));
  const ingredientKeys = (p: WeekImportPreview) =>
    new Set(
      [...p.recipes.flatMap((r) => r.lines), ...p.subRecipes.flatMap((sr) => sr.lines)]
        .filter((l) => !l.isSubRecipe)
        .map((l) => l.key),
    );
  /** Change le coût de toutes les lignes d'un ingrédient (×factor) dans une copie de l'aperçu. */
  const withCost = (p: WeekImportPreview, key: string, factor: number, week: number) => {
    const copy = structuredClone(p);
    copy.week = week;
    for (const l of [...copy.recipes.flatMap((r) => r.lines), ...copy.subRecipes.flatMap((sr) => sr.lines)]) {
      if (l.key === key && l.cost != null) l.cost = Math.round(l.cost * factor * 10_000) / 10_000;
    }
    return copy;
  };
  const save = (preview: WeekImportPreview) =>
    saveWeekImport(t.db, admin, {
      preview,
      tomeFileName: "tome.pdf",
      planFileName: "plan.xlsx",
      planSheetName: `S${preview.week}`,
    });

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const teamDId = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "D")))[0]!.id;
    admin = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "admin",
        displayName: "Administration",
        roleCode: "admin",
        password: "mot-de-passe-admin",
      }),
    );
    teamD = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "equipe-d",
        displayName: "Équipe D",
        roleCode: "equipe",
        teamId: teamDId,
        password: "mot-de-passe-equipe",
        zoneIds: await allZoneIds(t.db),
      }),
    );
    s45 = buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid()));
    // Produit saisi à la main avant le référentiel : il doit être rattaché, pas doublé.
    await createProduct(t.db, admin, { name: "Ail pelé", category: "matiere_premiere", defaultUnit: "kg" });
    await save(s45);
  });

  afterAll(async () => {
    await t.close();
  });

  it("chaque ingrédient du tome devient un produit, avec un prix daté du début de la semaine", async () => {
    const products = await melba();
    expect(products).toHaveLength(ingredientKeys(s45).size);
    const garlic = await byKey("ail pele");
    expect(garlic.source).toBe("manuel");
    expect(products.filter((p) => p.name.toLowerCase() === "ail pelé")).toHaveLength(1);
    const prices = await pricesOf(garlic.id);
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ source: "tome", validFrom: S45, unit: "g" });
    expect(prices[0]!.perKgEur).toBeGreaterThan(0);
    expect((await melba()).some((p) => p.category === "moule_plat_gratin")).toBe(true);
  });

  it("un nouveau tome ajoute une version seulement pour les prix qui changent ; nom et état manuels gardés", async () => {
    const garlic = await byKey("ail pele");
    const before = (await pricesOf(garlic.id))[0]!;
    const other = (await melba()).find((p) => p.id !== garlic.id && p.category === "matiere_premiere")!;
    await updateProduct(t.db, admin, other.id, {
      name: "Nom choisi à la main",
      category: "matiere_premiere",
      defaultUnit: other.defaultUnit,
    });
    await setProductActive(t.db, admin, other.id, false);
    const otherPrices = (await pricesOf(other.id)).length;

    const s46 = withCost(s45, "ail pele", 1.1, 46);
    s46.recipes[0]!.lines.push({
      label: "Fleur de sel de Camargue",
      key: "fleur de sel de camargue",
      isSubRecipe: false,
      quantity: 1000,
      unit: "g",
      unitWeightG: null,
      cost: 3,
    });
    await save(s46);

    const prices = (await pricesOf(garlic.id)).sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    expect(prices.map((p) => p.validFrom)).toEqual([S45, S46]);
    expect(prices[1]!.perKgEur).toBeCloseTo(before.perKgEur! * 1.1, 2);
    expect((await pricesOf(other.id)).length).toBe(otherPrices);
    const renamed = (await t.db.select().from(s.products).where(eq(s.products.id, other.id)))[0]!;
    expect(renamed).toMatchObject({ name: "Nom choisi à la main", active: false });
    const salt = await byKey("fleur de sel de camargue");
    expect(salt).toMatchObject({ name: "Fleur de sel de Camargue", source: "tome", defaultUnit: "kg" });
    expect((await pricesOf(salt.id))[0]).toMatchObject({ validFrom: S46, perKgEur: 3 });
  });

  it("un nouvel import de la même semaine remplace le prix de cette semaine, sans nouvelle version", async () => {
    const garlic = await byKey("ail pele");
    const s45Price = (await pricesOf(garlic.id)).find((p) => p.validFrom === S45)!.perKgEur!;
    await save(withCost(s45, "ail pele", 1.2, 46));
    const prices = await pricesOf(garlic.id);
    expect(prices).toHaveLength(2);
    expect(prices.find((p) => p.validFrom === S46)!.perKgEur).toBeCloseTo(s45Price * 1.2, 2);
  });

  it("la reprise des tomes déjà importés ne change rien quand tout est à jour", async () => {
    const r = await buildMaterialsFromTomes(t.db, admin);
    expect(r).toMatchObject({ created: 0, linked: 0, newPrices: 0, weeks: ["S45-2026", "S46-2026"] });
    expect(r.materials).toBe((await melba()).length);
  });

  it("une perte de matière prend le prix en vigueur à sa date, et le garde", async () => {
    const garlic = await byKey("ail pele");
    const sub = async (code: string) => (await t.db.select().from(s.subzones).where(eq(s.subzones.code, code)))[0]!.id;
    const cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "REC_CASSE_MANIP")))[0]!.id;
    const bin = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    const reception = await sub("REC_RECEPTION");
    const create = (occurredOn: string) =>
      createDeclaration(
        t.db,
        teamD,
        {
          occurredOn,
          subzoneId: reception,
          product: { productId: garlic.id },
          method: "pesee",
          quantity: 2,
          unitCode: "kg",
          causeId: cause,
          destinations: [{ destinationId: bin, quantity: 2, binNumber: "1" }],
        },
        NOW,
      );
    const p45 = (await materialPriceAt(t.db, garlic.id, "2026-11-02"))!.perKgEur!;
    const p46 = (await materialPriceAt(t.db, garlic.id, "2026-11-06"))!.perKgEur!;
    const d45 = await create("2026-11-02");
    const d46 = await create("2026-11-06");
    const row = async (id: string) =>
      (await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, id)))[0]!;
    expect(await row(d45.id)).toMatchObject({
      costPerKgEur: p45,
      materialCostEur: Math.round(2 * p45 * 10_000) / 10_000,
    });
    expect(await row(d46.id)).toMatchObject({ costPerKgEur: p46 });
    expect((await row(d46.id)).costDetails).toMatchObject({ priceVersion: { source: "tome", validFrom: S46 } });

    // Un prix d'achat (bon de commande) passe devant le tome pour les pertes suivantes ; les anciennes ne bougent pas.
    await t.db
      .insert(s.productPrices)
      .values({ productId: garlic.id, source: "bon_commande", validFrom: "2026-11-06", unit: "kg", perKgEur: 9.5 });
    expect((await materialPriceAt(t.db, garlic.id, "2026-11-06"))!.perKgEur).toBe(9.5);
    expect((await row(d46.id)).costPerKgEur).toBe(p46);
    const unchanged = await t.db
      .select()
      .from(s.productPrices)
      .where(and(eq(s.productPrices.productId, garlic.id), eq(s.productPrices.source, "tome")));
    expect(unchanged).toHaveLength(2);
  });

  it("les liquides reçoivent la densité de référence ; une perte en litres est convertie en kg", async () => {
    expect((await byKey("huile colza")).densityKgPerL).toBe(0.915);
    expect((await byKey("huile olive colza")).densityKgPerL).toBe(0.914); // mélange : moyenne
    expect((await byKey("lait demi ecreme")).densityKgPerL).toBe(1.033);
    expect((await byKey("lait de coco thai kitchen poche")).densityKgPerL).toBeNull();
    expect((await byKey("ail pele")).densityKgPerL).toBeNull();

    // Une densité saisie à la main n'est jamais remplacée.
    const vinegar = await byKey("vinaigre de vin");
    await t.db.update(s.products).set({ densityKgPerL: 1.02 }).where(eq(s.products.id, vinegar.id));
    expect((await buildMaterialsFromTomes(t.db, admin)).densities).toBe(0);
    expect((await byKey("vinaigre de vin")).densityKgPerL).toBe(1.02);

    // Ingrédient de la semaine saisi en litres : la densité de la matière du référentiel sert à la conversion.
    const [current] = await t.db
      .select({ id: s.weeklyImports.id })
      .from(s.weeklyImports)
      .innerJoin(s.productionWeeks, eq(s.weeklyImports.productionWeekId, s.productionWeeks.id))
      .where(and(eq(s.productionWeeks.startDate, S45), eq(s.weeklyImports.status, "validee")));
    const [oil] = await t.db
      .select()
      .from(s.weekRecipeLines)
      .where(and(eq(s.weekRecipeLines.importId, current!.id), eq(s.weekRecipeLines.key, "huile colza")));
    expect(await findWeekItem(t.db, "ingredient", oil!.id)).toMatchObject({ densityKgPerL: 0.915 });
    const sub = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "REC_RECEPTION")))[0]!.id;
    const cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "REC_CASSE_MANIP")))[0]!.id;
    const bin = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    const d = await createDeclaration(
      t.db,
      teamD,
      {
        occurredOn: "2026-11-02",
        subzoneId: sub,
        product: { weekItem: { kind: "ingredient", id: oil!.id } },
        method: "estimation_manuelle",
        quantity: 2,
        unitCode: "l",
        causeId: cause,
        destinations: [{ destinationId: bin, quantity: 2, binNumber: "1" }],
      },
      NOW,
    );
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, d.id));
    expect(row).toMatchObject({ netKg: 1.83, kgStatus: "converti" });
  });
});
