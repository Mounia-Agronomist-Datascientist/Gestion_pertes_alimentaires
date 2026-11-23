import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createProduct, listUnlistedGroups, linkUnlistedGroup, priceUnlistedGroup } from "@/modules/admin/products";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { addManualPrice } from "@/modules/matieres/fiche";
import { createTestDb } from "../helpers/test-db";

describe("produit absent de la liste en Stockage : types de la zone et prix d'achat (décision du 20/11/2026)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const NOW = new Date("2026-11-13T10:00:00Z");
  const id = async (table: typeof s.subzones | typeof s.causes | typeof s.destinations, code: string) =>
    (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;
  const loss = async (
    name: string,
    category: string,
    kg: number,
    price?: { amountEur: number; per: "kg" | "piece" },
    place: [string, string] = ["STO_BOF", "STO_PEREMPTION"],
  ) =>
    createDeclaration(
      t.db,
      admin,
      {
        occurredOn: "2026-11-12",
        subzoneId: await id(s.subzones, place[0]),
        product: { freeLabel: name, category, price },
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

  it("en Stockage, seulement une matière première ou un encas", async () => {
    for (const category of ["sous_recette", "recette", "produit_fini", "consommable", "moule_plat_gratin"])
      await expect(loss("Essai", category, 1)).rejects.toThrow(/non proposé dans la zone Stockage/);
    await loss("Barre de céréales", "produit_externe", 1);
  });

  it("prix indiqué à la saisie : la perte est chiffrée", async () => {
    const d = await loss("Beurre doux", "matiere_premiere", 2, { amountEur: 8.5, per: "kg" });
    expect(await row(d.id)).toMatchObject({ grossCostEur: 17, materialCostEur: 17, costPerKgEur: 8.5 });
  });

  it("prix indiqué après coup : nouvelle version, coût recalculé ; rattachement au prix du produit", async () => {
    // Saisie « hors liste » (Conditionnement ; en Réception et Stockage, l'article entre aussitôt dans la liste).
    const conditionnement: [string, string] = ["CON_AUTRES", "CON_SURPRODUCTION"];
    const first = await loss("Crème fraîche", "matiere_premiere", 3, undefined, conditionnement);
    await loss("crème  FRAÎCHE", "matiere_premiere", 1, undefined, conditionnement);
    expect((await row(first.id)).grossCostEur).toBeNull();
    const group = (await listUnlistedGroups(t.db, admin)).find((g) => g.label === "Crème fraîche")!;
    expect(group).toMatchObject({ count: 2, priced: 0, freePrice: null });

    expect(await priceUnlistedGroup(t.db, admin, group.key, { amountEur: 4, per: "kg" }, NOW)).toBe(2);
    expect(await row(first.id)).toMatchObject({ grossCostEur: 12, status: "corrigee", revision: 2 });
    expect((await listUnlistedGroups(t.db, admin)).find((g) => g.key === group.key)).toMatchObject({
      priced: 2,
      freePrice: { amountEur: 4, per: "kg" },
    });

    // Rattachement à un produit qui a son prix : coût au prix du produit à la date de la perte.
    const product = await createProduct(t.db, admin, {
      name: "Crème fraîche 30 %",
      category: "matiere_premiere",
      defaultUnit: "kg",
    });
    await addManualPrice(t.db, admin, product.id, { validFrom: "2026-11-01", perKgEur: 5, perUnitEur: null });
    await linkUnlistedGroup(t.db, admin, group.key, product.id, NOW);
    expect(await row(first.id)).toMatchObject({ grossCostEur: 15, productId: product.id, revision: 3 });

    await expect(priceUnlistedGroup(t.db, admin, "inconnu", { amountEur: 1, per: "kg" })).rejects.toThrow();
  });
});
