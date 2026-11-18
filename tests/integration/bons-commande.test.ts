import { readdirSync, readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { type ParsedPurchaseOrder, parsePurchaseOrder } from "@/modules/imports/bons-commande/parse-bon";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";
import { PurchaseOrderError, purchaseOrdersOverview, savePurchaseOrders } from "@/modules/matieres/bons-commande";
import { materialPriceAt } from "@/modules/matieres/referentiel";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const DIR = "tests/fixtures/bons-commande";
const orders: ParsedPurchaseOrder[] = readdirSync(DIR).map((f) => {
  const items = (JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as [number, number, number, number, number, string][]).map(
    ([page, x, y, width, size, text]): PdfItem => ({ page, x, y, width, size, text }),
  );
  const r = parsePurchaseOrder(f.replace(/\.items\.json$/, ".pdf"), items);
  if (!r.ok) throw new Error(r.error);
  return r.order;
});
const byNumber = (n: string) => orders.find((o) => o.number === n)!;

describe("bons de commande fournisseurs", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const product = async (key: string) => (await t.db.select().from(s.products).where(eq(s.products.externalId, `melba:${key}`)))[0];

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
  });

  afterAll(async () => {
    await t.close();
  });

  it("enregistre les bons : fournisseurs, catégories, matières, colis et prix d'achat", async () => {
    const r = await savePurchaseOrders(t.db, admin, orders);
    expect(r).toMatchObject({ orders: 8, replaced: 0, newSuppliers: 7, outsideCalendar: 0 });
    expect(r.lines).toBe(orders.reduce((n, o) => n + o.lines.length, 0));
    const suppliers = await t.db.select().from(s.suppliers);
    expect(suppliers.map((x) => x.name).sort()).toEqual(["APO", "Guasch", "Metro", "Passion Froid", "Pro à Pro", "Rue traversette", "Transgourmet"]);

    const garlic = (await product("ail pele"))!;
    expect(garlic).toMatchObject({ name: "ail pelé", source: "bon_commande", category: "matiere_premiere" });
    const [category] = await t.db.select().from(s.materialCategories).where(eq(s.materialCategories.id, garlic.materialCategoryId!));
    expect(category!.name).toBe("Légume 4eme gamme: prêt à l'emploi");
    const [apo] = suppliers.filter((x) => x.name === "APO");
    const [packaging] = await t.db.select().from(s.supplierProducts).where(and(eq(s.supplierProducts.productId, garlic.id), eq(s.supplierProducts.supplierId, apo!.id)));
    expect(packaging).toMatchObject({ supplierCode: "0201107", packagingLabel: "Sachet 5kg", contentQuantity: 5, contentUnit: "kg", lastDeliveryDate: "2026-11-10" });
    expect((await materialPriceAt(t.db, garlic.id, "2026-11-10"))).toMatchObject({ source: "bon_commande", perKgEur: 9.5 });
    expect(await materialPriceAt(t.db, garlic.id, "2026-11-09")).toBeNull();

    // Prix au colis ramené au kg ; préparation d'encas achetée = matière première ; prix au litre jamais inventé.
    expect(await materialPriceAt(t.db, (await product("pave de saumon du pacifique msg sauvage keta a p s a 150gr"))!.id, "2026-11-10")).toMatchObject({ perKgEur: 6.5 });
    expect(await product("rue traversette preparation pomme fraise")).toMatchObject({ category: "matiere_premiere" });
    expect(await materialPriceAt(t.db, (await product("huile de sesame"))!.id, "2026-12-01")).toBeNull();

    const weeks = await t.db
      .select({ number: s.purchaseOrders.number, week: s.productionWeeks.number, year: s.productionWeeks.year })
      .from(s.purchaseOrders)
      .innerJoin(s.productionWeeks, eq(s.purchaseOrders.productionWeekId, s.productionWeeks.id));
    expect(weeks.find((w) => w.number === "20261112002")).toMatchObject({ week: 48, year: 2026 });
    expect(weeks.find((w) => w.number === "20260226030")).toMatchObject({ week: 11, year: 2026 });
  });

  it("ne garde aucune adresse e-mail", async () => {
    const rows = await Promise.all([t.db.select().from(s.purchaseOrders), t.db.select().from(s.purchaseOrderLines), t.db.select().from(s.suppliers)]);
    expect(JSON.stringify(rows)).not.toMatch(/@/);
  });

  it("le tome retrouve les matières des bons, sans doublon ni changement de nom", async () => {
    const before = (await product("ail pele"))!;
    await saveWeekImport(t.db, admin, { preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())), tomeFileName: "tome.pdf", planFileName: "plan.xlsx", planSheetName: "S45" });
    const garlic = await t.db.select().from(s.products).where(eq(s.products.externalId, "melba:ail pele"));
    expect(garlic).toHaveLength(1);
    expect(garlic[0]).toMatchObject({ id: before.id, name: "ail pelé", source: "bon_commande" });
    // Prix du tome (S45) avant la livraison, prix d'achat ensuite.
    expect(await materialPriceAt(t.db, before.id, "2026-11-02")).toMatchObject({ source: "tome" });
    expect(await materialPriceAt(t.db, before.id, "2026-11-12")).toMatchObject({ source: "bon_commande", perKgEur: 9.5 });
  });

  it("un bon redéposé remplace ses lignes et son prix ; un même prix ne crée pas de version", async () => {
    const apo = structuredClone(byNumber("20261104036"));
    apo.lines[0]!.unitPriceEur = 9.9;
    const r = await savePurchaseOrders(t.db, admin, [apo]);
    expect(r).toMatchObject({ orders: 1, replaced: 1, newSuppliers: 0, createdMaterials: 0, newPrices: 1 });
    const [order] = await t.db.select().from(s.purchaseOrders).where(eq(s.purchaseOrders.number, "20261104036"));
    expect(order!.version).toBe(2);
    expect(await t.db.select().from(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.orderId, order!.id))).toHaveLength(apo.lines.length);
    const garlic = (await product("ail pele"))!;
    expect(await materialPriceAt(t.db, garlic.id, "2026-11-12")).toMatchObject({ perKgEur: 9.9 });
    expect(await t.db.select().from(s.productPrices).where(and(eq(s.productPrices.productId, garlic.id), eq(s.productPrices.source, "bon_commande")))).toHaveLength(1);

    // Même prix la semaine suivante : pas de nouvelle version.
    const next = structuredClone(apo);
    next.number = "20261111099";
    next.deliveryDate = "2026-11-17";
    next.week = 48;
    expect((await savePurchaseOrders(t.db, admin, [next])).newPrices).toBe(0);
  });

  it("résumé pour l'écran d'import, et refus de données inattendues", async () => {
    const overview = await purchaseOrdersOverview(t.db, admin);
    expect(overview.recent).toHaveLength(9);
    expect(overview.bySupplier.find((x) => x.supplier === "Pro à Pro")).toMatchObject({ orders: 2, from: "2026-03-02", to: "2026-11-10" });
    await expect(savePurchaseOrders(t.db, admin, [{ ...orders[0], number: "abc" }])).rejects.toBeInstanceOf(PurchaseOrderError);
  });
});
