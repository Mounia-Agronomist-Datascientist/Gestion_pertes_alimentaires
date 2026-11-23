import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import {
  createProduct,
  listEnteredArticles,
  mergeEnteredArticle,
  validateEnteredArticle,
} from "@/modules/admin/products";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

describe("article saisi à la main en Réception ou Stockage : ajouté à la liste, à valider (décision du 23/11/2026)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const NOW = new Date("2026-11-13T10:00:00Z");
  const id = async (table: typeof s.subzones | typeof s.causes | typeof s.destinations, code: string) =>
    (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;
  const loss = async (
    product: Record<string, unknown>,
    kg = 2,
    place: [string, string] = ["STO_BOF", "STO_PEREMPTION"],
  ) =>
    createDeclaration(
      t.db,
      admin,
      {
        occurredOn: "2026-11-12",
        subzoneId: await id(s.subzones, place[0]),
        product,
        method: "pesee",
        quantity: kg,
        unitCode: "kg",
        causeId: await id(s.causes, place[1]),
        destinations: [{ destinationId: await id(s.destinations, "ORDURES"), quantity: kg }],
      },
      NOW,
    );
  const row = async (declarationId: string) =>
    (await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, declarationId)))[0]!;

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
  });

  afterAll(async () => {
    await t.close();
  });

  it("Réception : seulement matière première ou encas", async () => {
    const [reception] = await t.db
      .select({ sub: s.subzones.code })
      .from(s.subzones)
      .innerJoin(s.zones, eq(s.zones.id, s.subzones.zoneId))
      .where(eq(s.zones.code, "RECEPTION"));
    const [cause] = await t.db
      .select({ code: s.causes.code })
      .from(s.causes)
      .innerJoin(s.causeZones, eq(s.causeZones.causeId, s.causes.id))
      .innerJoin(s.zones, eq(s.zones.id, s.causeZones.zoneId))
      .where(eq(s.zones.code, "RECEPTION"));
    await expect(
      loss({ freeLabel: "Essai", category: "sous_recette" }, 1, [reception!.sub, cause!.code!]),
    ).rejects.toThrow(/non proposé dans la zone Réception/);
  });

  it("crée l'article « à valider » avec son fournisseur tapé et son prix ; le même nom le retrouve", async () => {
    const first = await loss({
      freeLabel: "Beurre AOP 250 g",
      category: "matiere_premiere",
      price: { amountEur: 9, per: "kg" },
      supplier: { supplierName: "Laiterie du Coin" },
    });
    const d = await row(first.id);
    expect(d).toMatchObject({ productUnlisted: false, grossCostEur: 18 });
    const [product] = await t.db.select().from(s.products).where(eq(s.products.id, d.productId!));
    expect(product).toMatchObject({
      name: "Beurre AOP 250 g",
      toValidate: true,
      source: "saisie",
      enteredBy: admin.id,
    });
    const [supplier] = await t.db.select().from(s.suppliers).where(eq(s.suppliers.id, product!.manualSupplierId!));
    expect(supplier).toMatchObject({ name: "Laiterie du Coin", toValidate: true });

    const second = await loss({ freeLabel: "beurre aop  250 G", category: "matiere_premiere" }, 1);
    expect((await row(second.id)).productId).toBe(product!.id);
    expect((await row(second.id)).grossCostEur).toBe(9);

    const listed = await listEnteredArticles(t.db, admin);
    expect(listed).toEqual([
      expect.objectContaining({ name: "Beurre AOP 250 g", supplier: "Laiterie du Coin", declarations: 2 }),
    ]);
  });

  it("validation, ou fusion avec l'article existant (pertes déplacées, coût au prix de l'article)", async () => {
    const other = await loss({ freeLabel: "Crème épaisse", category: "matiere_premiere" });
    const created = (await row(other.id)).productId!;
    await validateEnteredArticle(t.db, admin, created, NOW);
    expect((await listEnteredArticles(t.db, admin)).map((a) => a.name)).toEqual(["Beurre AOP 250 g"]);

    const target = await createProduct(t.db, admin, {
      name: "Beurre doux AOP",
      category: "matiere_premiere",
      defaultUnit: "kg",
    });
    const [entered] = await listEnteredArticles(t.db, admin);
    expect(await mergeEnteredArticle(t.db, admin, entered!.id, target.id, NOW)).toBe(2);
    const [source] = await t.db.select().from(s.products).where(eq(s.products.id, entered!.id));
    expect(source).toMatchObject({ active: false, toValidate: false });
    const moved = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.productId, target.id));
    expect(moved).toHaveLength(2);
    expect(moved.every((m) => m.status === "corrigee")).toBe(true);
    expect(await listEnteredArticles(t.db, admin)).toEqual([]);
  });
});
