import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { compositeSnackKey } from "@/domain/encas-tome";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { importSnackTome, type SnackTomePayload } from "@/modules/matieres/encas-tome";
import { createTestDb } from "../helpers/test-db";

const line = (label: string, quantity: number, unit: string, unitWeightG: number | null, cost: number | null) => ({
  label,
  key: compositeSnackKey(label),
  isSubRecipe: false,
  quantity,
  unit,
  unitWeightG,
  cost,
});
type Recipe = SnackTomePayload["recipes"][number];
const recipe = (code: string, name: string, week: number, lines: Recipe["lines"], g: number, cost: number): Recipe => ({
  year: 2026,
  week,
  code,
  name,
  lines,
  total: { quantity: g, unit: "g", cost },
});

describe("PDF Melba des encas : liste interne des poids et des prix (décision du 25/11/2026)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const barre = line("Barre de céréales noisette", 1, "Unité (30 g)", 30, 0.9);
  const comte = line("Comté barre 25g", 1, "portion (25 g)", 25, 0.49);
  const cantal = line("Cantal barre 25g", 1, "portion (25 g)", 25, 0.41);
  const product = async (externalId: string) =>
    (await t.db.select().from(s.products).where(eq(s.products.externalId, externalId)))[0];
  const prices = async (productId: string) =>
    (await t.db.select().from(s.productPrices).where(eq(s.productPrices.productId, productId)))
      .map((p) => `${p.validFrom} ${p.perUnitEur}`)
      .sort();

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

  it("premier chargement sur plusieurs semaines : encas créés, prix datés, version seulement si le prix change", async () => {
    const r = await importSnackTome(t.db, admin, {
      fileName: "encas.pdf",
      recipes: [
        recipe("EN09_FB", "Barre de céréales noisette", 45, [barre], 30, 0.9),
        recipe("EN01_EQ", "Comté, Cantal", 45, [comte, cantal], 50, 0.9),
        recipe("EN09_FB", "Barre de céréales noisette", 46, [barre], 30, 0.9),
        recipe("EN09_FB", "Barre de céréales noisette", 47, [{ ...barre, cost: 0.95 }], 30, 0.95),
      ],
    });
    expect(r).toMatchObject({ weeks: ["S45-2026", "S46-2026", "S47-2026"], snacks: 4, created: 4, composites: 1 });
    const b = (await product("melba:barre de cereales noisette"))!;
    expect(b).toMatchObject({ category: "produit_externe", unitWeightKg: 0.03, name: "Barre de céréales noisette" });
    // S45 (jeudi 29/10) puis S47 (prix changé) ; S46, même prix, ne crée pas de version.
    expect(await prices(b.id)).toEqual(["2026-10-29 0.9", "2026-11-12 0.95"]);
    const trio = (await product("encas:comte cantal"))!;
    expect(trio).toMatchObject({ category: "produit_externe", unitWeightKg: 0.05 });
    expect(await prices(trio.id)).toEqual(["2026-10-29 0.9"]);
  });

  it("un poids changé dans un tome plus récent est repris ; nom et famille réglés à la main ne bougent pas", async () => {
    const b = (await product("melba:barre de cereales noisette"))!;
    await t.db
      .update(s.products)
      .set({ name: "Barre noisette", snackFamily: "Barres de céréales" })
      .where(eq(s.products.id, b.id));
    const r = await importSnackTome(t.db, admin, {
      fileName: "encas-s48.pdf",
      recipes: [
        recipe(
          "EN09_FB",
          "Barre de céréales noisette",
          48,
          [{ ...barre, unit: "Unité (35 g)", unitWeightG: 35 }],
          35,
          0.95,
        ),
      ],
    });
    expect(r).toMatchObject({ created: 0, newWeights: 1, newPrices: 1 });
    expect(await product("melba:barre de cereales noisette")).toMatchObject({
      name: "Barre noisette",
      snackFamily: "Barres de céréales",
      unitWeightKg: 0.035,
    });
    // Un fichier plus ancien ne remet pas l'ancien poids.
    await importSnackTome(t.db, admin, {
      fileName: "encas-s45.pdf",
      recipes: [recipe("EN09_FB", "Barre de céréales noisette", 45, [barre], 30, 0.9)],
    });
    expect((await product("melba:barre de cereales noisette"))?.unitWeightKg).toBe(0.035);
  });

  it("refuse un fichier sans encas et une semaine hors calendrier", async () => {
    await expect(
      importSnackTome(t.db, admin, {
        fileName: "plats.pdf",
        recipes: [{ ...recipe("EN09_FB", "x", 45, [], 30, 1), code: "VI01" }],
      }),
    ).rejects.toThrow(/Aucun encas/);
    await expect(
      importSnackTome(t.db, admin, {
        fileName: "vieux.pdf",
        recipes: [{ ...recipe("EN09_FB", "Barre", 10, [barre], 30, 0.9), year: 2001 }],
      }),
    ).rejects.toThrow(/calendrier/);
  });
});
