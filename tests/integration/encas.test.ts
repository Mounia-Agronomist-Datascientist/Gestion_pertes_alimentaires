import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { isSnackCategory } from "@/domain/matieres";
import { createProduct } from "@/modules/admin/products";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { createDeclaration } from "@/modules/declarations/service";
import { addManualPrice } from "@/modules/matieres/fiche";
import { createTestDb } from "../helpers/test-db";

describe("liste des encas, quelle que soit la semaine (décision du 20/11/2026)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let snackId: string;
  const NOW = new Date("2026-11-13T10:00:00Z");
  const id = async (table: typeof s.subzones | typeof s.causes | typeof s.destinations, code: string) =>
    (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;
  const loss = async (subzone: string, cause: string, pieces: number, teamId?: string) =>
    createDeclaration(
      t.db,
      admin,
      {
        occurredOn: "2026-11-12",
        subzoneId: await id(s.subzones, subzone),
        teamId,
        product: { productId: snackId },
        method: "comptage",
        quantity: pieces,
        unitCode: "piece",
        causeId: await id(s.causes, cause),
        destinations: [{ destinationId: await id(s.destinations, "ORDURES"), quantity: pieces }],
      },
      NOW,
    );

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
    snackId = (
      await createProduct(t.db, admin, {
        name: "Biscuit à la mimolette",
        category: "produit_externe",
        code: "",
        variant: "",
        snackFamily: "Biscuits / Gâteaux",
        defaultUnit: "piece",
        unitWeightKg: "0,03",
        densityKgPerL: "",
      })
    ).id;
    await addManualPrice(t.db, admin, snackId, { validFrom: "2026-01-01", perKgEur: "30", perUnitEur: "0,9" });
  });

  afterAll(async () => {
    await t.close();
  });

  it("catégorie Melba « ENCAS » d'une ligne de bon", () => {
    expect(isSnackCategory("ENCAS")).toBe(true);
    expect(isSnackCategory(" Encas ")).toBe(true);
    expect(isSnackCategory("Yaourt")).toBe(false);
    expect(isSnackCategory(null)).toBe(false);
  });

  it("proposé avec sa famille ; compté à la pièce en Stockage et chiffré au prix d'achat", async () => {
    const options = await getDeclarationOptions(t.db, admin, "2026-11-12");
    expect(options.products.find((p) => p.id === snackId)).toMatchObject({
      category: "produit_externe",
      snackFamily: "Biscuits / Gâteaux",
    });
    const d = await loss("STO_BOF", "STO_PEREMPTION", 10);
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, d.id));
    expect(row).toMatchObject({ netKg: 0.3, grossCostEur: 9, productCategory: "produit_externe" });
  });

  it("refusé hors conditionnement, réception et stockage (règle R9)", async () => {
    const [team] = await t.db.select().from(s.teams).limit(1);
    await expect(loss("CUI_DEBOITAGE", "CUI_FOUR_SALE", 1, team!.id)).rejects.toThrow(/encas se déclarent/);
  });
});
