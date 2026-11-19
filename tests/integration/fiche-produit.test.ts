import { readdirSync, readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { parsePurchaseOrder } from "@/modules/imports/bons-commande/parse-bon";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";
import { savePurchaseOrders } from "@/modules/matieres/bons-commande";
import {
  addManualPrice,
  listSuppliers,
  removeManualPackaging,
  saveManualPackaging,
  suppliersByProduct,
  placementChoices,
  ProductSheetError,
  productSheet,
  removeManualPrice,
  renameSupplier,
  setProductPlacement,
} from "@/modules/matieres/fiche";
import { materialPriceAt } from "@/modules/matieres/referentiel";
import { packagingOptions } from "@/modules/matieres/colis";
import { createDeclaration } from "@/modules/declarations/service";
import { materialsOfWeek } from "@/modules/matieres/semaine";
import { createTestDb } from "../helpers/test-db";

const DIR = "tests/fixtures/bons-commande";
const orders = readdirSync(DIR).map((f) => {
  const items = (
    JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as [number, number, number, number, number, string][]
  ).map(([page, x, y, width, size, text]): PdfItem => ({ page, x, y, width, size, text }));
  const r = parsePurchaseOrder(f.replace(/\.items\.json$/, ".pdf"), items);
  if (!r.ok) throw new Error(r.error);
  return r.order;
});

describe("fiche d'un produit et fournisseurs (étape 6.11)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let team: AuthUser;
  let product: typeof s.products.$inferSelect;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    admin = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "admin",
        displayName: "Administration",
        roleCode: "admin",
        password: "mot-de-passe-admin",
      }),
    );
    const [teamRow] = await t.db.select().from(s.teams).limit(1);
    team = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "equipe",
        displayName: "Équipe",
        roleCode: "equipe",
        teamId: teamRow!.id,
        password: "mot-de-passe-equipe",
      }),
    );
    await savePurchaseOrders(t.db, admin, orders);
    const [line] = await t.db.select().from(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.position, 1)).limit(1);
    product = (await t.db.select().from(s.products).where(eq(s.products.id, line!.productId)))[0]!;
  });

  afterAll(async () => {
    await t.close();
  });

  it("fiche : colis fournisseur et prix d'achat avec leur bon", async () => {
    const sheet = (await productSheet(t.db, admin, product.id, "2026-12-31"))!;
    expect(sheet.product.name).toBe(product.name);
    expect(sheet.packagings.length).toBeGreaterThan(0);
    expect(sheet.prices.length).toBeGreaterThan(0);
    expect(sheet.prices.filter((p) => p.inForce)).toHaveLength(1);
    expect(sheet.prices.find((p) => p.source === "bon_commande")?.order?.number).toBeTruthy();
    expect(await productSheet(t.db, admin, "pas-un-uuid", "2026-12-31")).toBeNull();
    await expect(productSheet(t.db, team, product.id, "2026-12-31")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lieu propre au produit : vérifié, tracé, gardé au dépôt suivant des bons", async () => {
    const { subzones } = await placementChoices(t.db);
    const bof = subzones.find((z) => z.name === "Chambre BOF")!;
    expect(
      await setProductPlacement(t.db, admin, product.id, {
        materialCategoryId: product.materialCategoryId,
        storageSubzoneId: bof.id,
      }),
    ).toBe(true);
    expect(
      await setProductPlacement(t.db, admin, product.id, {
        materialCategoryId: product.materialCategoryId,
        storageSubzoneId: bof.id,
      }),
    ).toBe(false);
    const reception = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "REC_RECEPTION")))[0]!;
    await expect(
      setProductPlacement(t.db, admin, product.id, { materialCategoryId: null, storageSubzoneId: reception.id }),
    ).rejects.toBeInstanceOf(ProductSheetError);
    expect(await t.db.select().from(s.auditLog).where(eq(s.auditLog.action, "set_product_placement"))).toHaveLength(1);

    // Bons redéposés : le lieu et la catégorie réglés à la main restent.
    await savePurchaseOrders(t.db, admin, orders);
    const [after] = await t.db.select().from(s.products).where(eq(s.products.id, product.id));
    expect(after!.storageSubzoneId).toBe(bof.id);
    expect(after!.materialCategoryId).toBe(product.materialCategoryId);

    const [order] = await t.db
      .select()
      .from(s.purchaseOrderLines)
      .where(eq(s.purchaseOrderLines.productId, product.id))
      .innerJoin(s.purchaseOrders, eq(s.purchaseOrderLines.orderId, s.purchaseOrders.id));
    const week = (await materialsOfWeek(t.db, order!.purchase_orders.productionWeekId!)).find(
      (m) => m.productId === product.id,
    )!;
    expect(week.storageSubzoneId).toBe(bof.id);
  });

  it("prix saisi à la main : nouvelle version datée, en vigueur à partir de sa date, retirable", async () => {
    const before = await materialPriceAt(t.db, product.id, "2026-12-01");
    const added = await addManualPrice(t.db, admin, product.id, {
      validFrom: "2026-12-01",
      perKgEur: "12,50",
      perUnitEur: "",
      unit: "",
    });
    expect(added.perKgEur).toBe(12.5);
    expect(added.unit).toBeNull();
    expect((await materialPriceAt(t.db, product.id, "2026-12-01"))!.perKgEur).toBe(12.5);
    expect((await materialPriceAt(t.db, product.id, "2026-11-30"))?.source).not.toBe("manuel");

    await expect(
      addManualPrice(t.db, admin, product.id, { validFrom: "2026-12-01", perKgEur: "13", perUnitEur: "" }),
    ).rejects.toThrow(/existe déjà/);
    await expect(
      addManualPrice(t.db, admin, product.id, { validFrom: "2026-12-02", perKgEur: "", perUnitEur: "" }),
    ).rejects.toThrow(/prix au kg ou à l'unité/);
    await expect(
      addManualPrice(t.db, admin, product.id, { validFrom: "2026-12-02", perKgEur: "-1", perUnitEur: "" }),
    ).rejects.toBeInstanceOf(ProductSheetError);
    const perUnit = await addManualPrice(t.db, admin, product.id, {
      validFrom: "2026-12-03",
      perKgEur: "",
      perUnitEur: "0,80",
    });
    expect(perUnit.unit).toBe("unité");

    // Seul un prix saisi à la main se retire.
    const bc = (await productSheet(t.db, admin, product.id, "2026-12-31"))!.prices.find(
      (p) => p.source === "bon_commande",
    )!;
    await expect(removeManualPrice(t.db, admin, product.id, bc.id)).rejects.toThrow(/Seul un prix saisi à la main/);
    await removeManualPrice(t.db, admin, product.id, added.id);
    await removeManualPrice(t.db, admin, product.id, perUnit.id);
    expect((await materialPriceAt(t.db, product.id, "2026-12-01"))?.id).toBe(before?.id);
    const audit = await t.db
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.entity, "product_price")));
    expect(audit.map((a) => a.action).sort()).toEqual([
      "add_manual_price",
      "add_manual_price",
      "remove_manual_price",
      "remove_manual_price",
    ]);
  });

  it("fournisseurs : compteurs, nom gardé au dépôt suivant", async () => {
    const suppliers = await listSuppliers(t.db, admin);
    expect(suppliers.length).toBeGreaterThan(0);
    expect(suppliers.every((x) => x.orders > 0 && x.materials > 0 && x.lastDelivery)).toBe(true);
    const first = suppliers[0]!;
    await renameSupplier(t.db, admin, first.id, "  Nom choisi  ");
    await expect(renameSupplier(t.db, admin, first.id, "x")).rejects.toBeInstanceOf(ProductSheetError);
    await savePurchaseOrders(t.db, admin, orders);
    expect((await t.db.select().from(s.suppliers).where(eq(s.suppliers.id, first.id)))[0]!.name).toBe("Nom choisi");
    expect((await listSuppliers(t.db, admin)).length).toBe(suppliers.length);
  });

  it("colis saisi à la main : fournisseur connu ou nouveau, gardé à côté du colis des bons", async () => {
    const sheet0 = (await productSheet(t.db, admin, product.id, "2026-12-31"))!;
    const known = sheet0.packagings[0]!;
    const a = await saveManualPackaging(t.db, admin, product.id, {
      supplierId: known.supplierId,
      packagingLabel: "Carton de 6",
      contentQuantity: "6",
      contentUnit: "pièce(s)",
    });
    expect(a.replaced).toBe(false);
    const b = await saveManualPackaging(t.db, admin, product.id, {
      supplierId: known.supplierId,
      packagingLabel: "Carton de 12",
      contentQuantity: "12",
      contentUnit: "pièce(s)",
      supplierCode: "X12",
    });
    expect(b.replaced).toBe(true);
    expect(b.packaging.id).toBe(a.packaging.id);

    // Nouveau fournisseur : nom seulement ; même clé que ses futurs bons, pas de doublon.
    const before = (await t.db.select().from(s.suppliers)).length;
    const n = await saveManualPackaging(t.db, admin, product.id, {
      newSupplier: "Ferme des Écureuils",
      packagingLabel: "Sac 10 kg",
      contentQuantity: "10",
      contentUnit: "kg",
    });
    expect((await t.db.select().from(s.suppliers)).length).toBe(before + 1);
    await saveManualPackaging(t.db, admin, product.id, {
      newSupplier: "ferme des ecureuils",
      packagingLabel: "Sac 5 kg",
      contentQuantity: "5",
      contentUnit: "kg",
    });
    expect((await t.db.select().from(s.suppliers)).length).toBe(before + 1);
    expect((await suppliersByProduct(t.db)).get(product.id)).toContain(n.packaging.supplierId);
    expect((await listSuppliers(t.db, admin)).find((x) => x.id === n.packaging.supplierId)).toMatchObject({
      orders: 0,
      materials: 1,
      lastDelivery: null,
    });

    await expect(
      saveManualPackaging(t.db, admin, product.id, { packagingLabel: "Carton", contentQuantity: "" }),
    ).rejects.toThrow(/fournisseur/);
    await expect(
      saveManualPackaging(t.db, admin, product.id, {
        supplierId: known.supplierId,
        packagingLabel: "Carton",
        contentQuantity: "6",
      }),
    ).rejects.toThrow(/unité/);
    await expect(
      saveManualPackaging(t.db, admin, product.id, {
        supplierId: known.supplierId,
        packagingLabel: "",
        contentQuantity: "",
      }),
    ).rejects.toBeInstanceOf(ProductSheetError);

    // Bons redéposés : le colis saisi reste, celui du bon aussi.
    await savePurchaseOrders(t.db, admin, orders);
    const sheet = (await productSheet(t.db, admin, product.id, "2026-12-31"))!;
    expect(sheet.packagings.find((k) => k.supplierId === known.supplierId)?.packagingLabel).toBe(known.packagingLabel);
    expect(sheet.manualPackagings.map((k) => k.packagingLabel).sort()).toEqual(["Carton de 12", "Sac 5 kg"]);

    await removeManualPackaging(t.db, admin, product.id, b.packaging.id);
    await expect(removeManualPackaging(t.db, admin, product.id, b.packaging.id)).rejects.toBeInstanceOf(
      ProductSheetError,
    );
    expect((await productSheet(t.db, admin, product.id, "2026-12-31"))!.manualPackagings).toHaveLength(1);
    expect(
      (await t.db.select().from(s.auditLog).where(eq(s.auditLog.entity, "manual_packaging")))
        .map((x) => x.action)
        .sort(),
    ).toEqual(["create", "create", "delete", "update", "update"]);
  });

  it("perte en colis en Réception : poids du colis, coût au prix en vigueur ; unités refusées hors de leur lieu", async () => {
    const NOW = new Date("2026-11-13T10:00:00Z");
    const sub = async (code: string) => (await t.db.select().from(s.subzones).where(eq(s.subzones.code, code)))[0]!.id;
    const cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "REC_CASSE_MANIP")))[0]!.id;
    const bin = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    const options = await packagingOptions(t.db);
    // Une matière dont le colis est en kg (« Sachet 5kg ») et qui a un prix au kg.
    let chosen: { productId: string; key: string; kg: number; label: string | null; supplier: string } | null = null;
    for (const [productId, list] of options) {
      const k = list.find((o) => o.source === "bon_commande");
      if (k && (await materialPriceAt(t.db, productId, "2026-11-12"))?.perKgEur != null) {
        chosen = { productId, ...k };
        break;
      }
    }
    expect(chosen).not.toBeNull();
    const c = chosen!;
    const base = {
      occurredOn: "2026-11-12",
      subzoneId: await sub("REC_RECEPTION"),
      product: { productId: c.productId },
      causeId: cause,
      destinations: [{ destinationId: bin, quantity: 2, binNumber: "1" }],
    };
    const d = await createDeclaration(
      t.db,
      admin,
      { ...base, method: "comptage", quantity: 2, unitCode: "colis", packagingKey: c.key },
      NOW,
    );
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, d.id));
    const price = (await materialPriceAt(t.db, c.productId, "2026-11-12"))!.perKgEur!;
    expect(row).toMatchObject({
      unitCode: "colis",
      netKg: Math.round(2 * c.kg * 10_000) / 10_000,
      kgStatus: "converti",
      conversionFactorUsed: c.kg,
      packagingLabel: `${c.label ?? "Colis"} — ${c.supplier}`,
      measurementMethod: "conversion_reference",
    });
    expect(row!.materialCostEur).toBeCloseTo(2 * c.kg * price, 2);

    // Poids corrigé à la saisie (cartons de 1 kg reçus au lieu du colis habituel) ; colis non connu, poids indiqué.
    const fmt = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg`;
    const corrected = await createDeclaration(
      t.db,
      admin,
      { ...base, method: "comptage", quantity: 2, unitCode: "colis", packagingKey: c.key, packagingKg: 1.25 },
      NOW,
    );
    const [rowCorrected] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, corrected.id));
    expect(rowCorrected).toMatchObject({
      netKg: 2.5,
      conversionFactorUsed: 1.25,
      packagingLabel: `${c.label ?? "Colis"} — ${c.supplier} (reçu : ${fmt(1.25)} au lieu de ${fmt(c.kg)})`,
    });
    const other = await createDeclaration(
      t.db,
      admin,
      {
        ...base,
        method: "comptage",
        quantity: 3,
        unitCode: "colis",
        packagingKg: 2,
        destinations: [{ destinationId: bin, quantity: 3, binNumber: "1" }],
      },
      NOW,
    );
    const [rowOther] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, other.id));
    expect(rowOther).toMatchObject({ netKg: 6, packagingLabel: "Colis de 2 kg (poids indiqué à la saisie)" });
    await expect(
      createDeclaration(t.db, admin, { ...base, method: "comptage", quantity: 1, unitCode: "colis" }, NOW),
    ).rejects.toThrow(/colis ou indiquez son poids/);

    // Colis inconnu, gastros et contenants en Réception, barquettes hors Conditionnement : refusés.
    await expect(
      createDeclaration(
        t.db,
        admin,
        { ...base, method: "comptage", quantity: 1, unitCode: "colis", packagingKey: `manuel:${c.productId}` },
        NOW,
      ),
    ).rejects.toThrow(/Colis inconnu/);
    await expect(
      createDeclaration(t.db, admin, { ...base, method: "estimation_contenant", quantity: 1, unitCode: "gastro" }, NOW),
    ).rejects.toThrow(/Unité non proposée dans ce lieu/);
    await expect(
      createDeclaration(t.db, admin, { ...base, method: "comptage", quantity: 1, unitCode: "barquette" }, NOW),
    ).rejects.toThrow(/Unité non proposée dans ce lieu/);
    // Pièces en Réception : seulement si le poids d'une pièce est connu.
    const [noWeight] = await t.db.select().from(s.products).where(eq(s.products.id, c.productId));
    if (noWeight!.unitWeightKg == null) {
      await expect(
        createDeclaration(t.db, admin, { ...base, method: "comptage", quantity: 1, unitCode: "piece" }, NOW),
      ).rejects.toThrow(/Unité non proposée dans ce lieu/);
    }
    // Le colis n'est pas proposé en Cuisine.
    await expect(
      createDeclaration(
        t.db,
        admin,
        {
          ...base,
          subzoneId: await sub("CUI_CUISINE"),
          teamId: (await t.db.select().from(s.teams).limit(1))[0]!.id,
          method: "comptage",
          quantity: 1,
          unitCode: "colis",
          packagingKey: c.key,
        },
        NOW,
      ),
    ).rejects.toThrow(/Unité non proposée dans ce lieu/);
  });
});
