import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import {
  countUnlistedDeclarations,
  createProduct,
  linkUnlistedGroup,
  listUnlistedGroups,
  setProductActive,
  updateProduct,
} from "@/modules/admin/products";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-09T10:00:00Z");

describe("référentiel des produits", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamUser: AuthUser;
  let cuisine: string;
  let cause: string;
  let compost: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const teamC = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "C")))[0]!.id;
    cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")))[0]!.id;
    cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")))[0]!.id;
    compost = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamUser = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-c", displayName: "Équipe C", roleCode: "equipe", teamId: teamC, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  const declareUnlisted = (freeLabel: string, quantity: number, unitCode: string, method: "pesee" | "comptage") =>
    createDeclaration(
      t.db,
      teamUser,
      {
        occurredOn: "2026-11-09",
        subzoneId: cuisine,
        product: { freeLabel, category: "sous_recette" },
        method,
        quantity,
        unitCode,
        causeId: cause,
        destinations: [{ destinationId: compost, quantity, binNumber: "1" }],
      },
      NOW,
    );

  it("crée un produit ; refuse un doublon de nom (accents et majuscules ignorés) ou de code", async () => {
    const p = await createProduct(t.db, admin, { name: "Purée de carottes", category: "sous_recette", code: "SR-01", defaultUnit: "kg", unitWeightKg: "" });
    expect(p).toMatchObject({ name: "Purée de carottes", unitWeightKg: null, source: "manuel", active: true });
    await expect(createProduct(t.db, admin, { name: "puree de CAROTTES", category: "sous_recette", defaultUnit: "kg" })).rejects.toThrow(/existe déjà/);
    await expect(createProduct(t.db, admin, { name: "Autre", category: "sous_recette", code: "sr-01", defaultUnit: "kg" })).rejects.toThrow(/code/);
    await expect(createProduct(t.db, admin, { name: "Purée de carottes", category: "recette", defaultUnit: "kg" })).resolves.toBeTruthy();
    await expect(createProduct(t.db, admin, { name: "Négatif", category: "recette", defaultUnit: "kg", unitWeightKg: "-1" })).rejects.toThrow(/positive/);
  });

  it("regroupe les saisies hors liste par nom et les rattache à un produit en gardant l'historique", async () => {
    const a = await declareUnlisted("Purée carottes", 2, "kg", "pesee");
    const b = await declareUnlisted("  purée CAROTTES ", 3, "kg", "pesee");
    const groups = await listUnlistedGroups(t.db, admin);
    const group = groups.find((g) => g.declarationIds.includes(a.id))!;
    expect(group.count).toBe(2);
    expect(group.declarationIds).toContain(b.id);

    const product = await createProduct(t.db, admin, { name: "Purée de carottes S46", category: "sous_recette", defaultUnit: "kg" });
    expect(await linkUnlistedGroup(t.db, admin, group.key, product.id, NOW)).toBe(2);

    const [d] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, a.id));
    expect(d).toMatchObject({ productId: product.id, productUnlisted: false, productName: "Purée de carottes S46", netKg: 2, kgStatus: "pese", status: "corrigee", revision: 2 });
    const revisions = await t.db.select().from(s.declarationRevisions).where(eq(s.declarationRevisions.declarationId, a.id));
    expect(revisions.map((r) => r.revision).sort()).toEqual([1, 2]);
    expect(revisions.find((r) => r.revision === 2)?.reason).toMatch(/Rattachement/);
    expect((await listUnlistedGroups(t.db, admin)).some((g) => g.key === group.key)).toBe(false);
    await expect(linkUnlistedGroup(t.db, admin, group.key, product.id, NOW)).rejects.toThrow(/déjà/);
  });

  it("un comptage en pièces est converti en kg si le produit a un poids unitaire", async () => {
    const d = await declareUnlisted("Galette maison", 10, "piece", "comptage");
    expect(d.kgStatus).toBe("non_converti");
    const product = await createProduct(t.db, admin, { name: "Galette", category: "sous_recette", defaultUnit: "piece", unitWeightKg: "0,12" });
    const group = (await listUnlistedGroups(t.db, admin)).find((g) => g.declarationIds.includes(d.id))!;
    await linkUnlistedGroup(t.db, admin, group.key, product.id, NOW);
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, d.id));
    expect(row).toMatchObject({ netKg: 1.2, kgStatus: "converti", conversionFactorUsed: 0.12, measurementMethod: "conversion_reference" });
    const [dest] = await t.db.select().from(s.declarationDestinations).where(and(eq(s.declarationDestinations.declarationId, d.id), eq(s.declarationDestinations.revision, 2)));
    expect(dest?.netKg).toBe(1.2);
  });

  it("une pesée en gastros rattachée garde sa tare et son poids, avec le produit de la liste", async () => {
    const gastro1 = (await t.db.select().from(s.containerTypes).where(eq(s.containerTypes.code, "GASTRO_1")))[0]!.id;
    const d = await createDeclaration(
      t.db,
      teamUser,
      {
        occurredOn: "2026-11-09",
        subzoneId: cuisine,
        product: { freeLabel: "Riz pilaf", category: "sous_recette" },
        method: "pesee",
        tare: { grossKg: 12.2, gastros: [{ containerTypeId: gastro1, count: 2 }] },
        causeId: cause,
        destinations: [{ destinationId: compost, quantity: 10, binNumber: "1" }],
      },
      NOW,
    );
    const product = await createProduct(t.db, admin, { name: "Riz pilaf", category: "sous_recette", defaultUnit: "kg" });
    const group = (await listUnlistedGroups(t.db, admin)).find((g) => g.declarationIds.includes(d.id))!;
    await linkUnlistedGroup(t.db, admin, group.key, product.id, NOW);
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, d.id));
    expect(row).toMatchObject({ productId: product.id, productUnlisted: false, productName: "Riz pilaf", tareTotalKg: 2.2, netKg: 10, kgStatus: "pese", revision: 2 });
    const containers = await t.db
      .select()
      .from(s.declarationContainers)
      .where(and(eq(s.declarationContainers.declarationId, d.id), eq(s.declarationContainers.revision, 2)));
    expect(containers.map((c) => c.count)).toEqual([2]);
  });

  it("modifier ou désactiver un produit ne change pas les déclarations passées", async () => {
    const product = await createProduct(t.db, admin, { name: "Taboulé", category: "sous_recette", defaultUnit: "kg" });
    const d = await declareUnlisted("Taboulé", 1, "kg", "pesee");
    const group = (await listUnlistedGroups(t.db, admin)).find((g) => g.declarationIds.includes(d.id))!;
    await linkUnlistedGroup(t.db, admin, group.key, product.id, NOW);
    await updateProduct(t.db, admin, product.id, { name: "Taboulé oriental", category: "sous_recette", defaultUnit: "kg" });
    await setProductActive(t.db, admin, product.id, false);
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, d.id));
    expect(row?.productName).toBe("Taboulé");
    const other = await declareUnlisted("Céleri", 1, "kg", "pesee");
    const g2 = (await listUnlistedGroups(t.db, admin)).find((g) => g.declarationIds.includes(other.id))!;
    await expect(linkUnlistedGroup(t.db, admin, g2.key, product.id, NOW)).rejects.toThrow(/désactivé/);
  });

  it("réserve la gestion des produits à l'administration", async () => {
    await expect(createProduct(t.db, teamUser, { name: "X produit", category: "recette", defaultUnit: "kg" })).rejects.toThrow(ForbiddenError);
    await expect(listUnlistedGroups(t.db, teamUser)).rejects.toThrow(ForbiddenError);
    expect(await countUnlistedDeclarations(t.db)).toBeGreaterThan(0);
  });
});
