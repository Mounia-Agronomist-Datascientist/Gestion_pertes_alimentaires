import { readdirSync, readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { parsePurchaseOrder } from "@/modules/imports/bons-commande/parse-bon";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";
import { savePurchaseOrders } from "@/modules/matieres/bons-commande";
import {
  categoriesForSetting,
  materialsOfWeek,
  setCategoriesStorage,
  StorageSettingError,
  storageSubzones,
} from "@/modules/matieres/semaine";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
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

describe("matières de la semaine en Réception et en Stockage", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const weekId = async (number: number) =>
    (
      await t.db
        .select()
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, number)))
    )[0]!.id;

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
    await saveWeekImport(t.db, admin, {
      preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())),
      tomeFileName: "tome.pdf",
      planFileName: "plan.xlsx",
      planSheetName: "S45",
    });
    await savePurchaseOrders(t.db, admin, orders);
  });

  afterAll(async () => {
    await t.close();
  });

  it("ingrédients du tome et matières commandées, une fois chacune", async () => {
    const s45 = await materialsOfWeek(t.db, await weekId(45));
    const keys = await t.db
      .selectDistinct({ key: s.weekRecipeLines.key })
      .from(s.weekRecipeLines)
      .where(eq(s.weekRecipeLines.isSubRecipe, false));
    expect(s45.length).toBe(keys.length);
    expect(new Set(s45.map((m) => m.productId)).size).toBe(s45.length);
    const ordered = s45.filter((m) => m.ordered);
    expect(ordered).toHaveLength(4); // bon Passion Froid de S45
    expect(ordered.every((m) => m.inTome && m.categoryId)).toBe(true);

    // S47 : pas de tome importé, seulement les bons.
    const s47 = await materialsOfWeek(t.db, await weekId(47));
    expect(s47.length).toBeGreaterThan(20);
    expect(s47.every((m) => m.ordered && !m.inTome)).toBe(true);
  });

  it("réglage catégorie → lieu de Stockage, vérifié et tracé", async () => {
    const { categories } = await categoriesForSetting(t.db, admin);
    const legume = categories.find((c) => c.name.startsWith("Légume 4eme gamme"))!;
    const legumerie = (await storageSubzones(t.db)).find((z) => z.name === "Légumerie")!;
    expect(await setCategoriesStorage(t.db, admin, [{ categoryId: legume.id, subzoneId: legumerie.id }])).toBe(1);
    expect(await setCategoriesStorage(t.db, admin, [{ categoryId: legume.id, subzoneId: legumerie.id }])).toBe(0);
    const reception = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "REC_RECEPTION")))[0]!;
    await expect(
      setCategoriesStorage(t.db, admin, [{ categoryId: legume.id, subzoneId: reception.id }]),
    ).rejects.toBeInstanceOf(StorageSettingError);
    const audit = await t.db.select().from(s.auditLog).where(eq(s.auditLog.action, "set_category_storage"));
    expect(audit).toHaveLength(1);

    // La saisie reçoit les matières de la semaine et le lieu de chaque catégorie.
    const options = await getDeclarationOptions(t.db, admin, "2026-11-13");
    expect(options.weekMaterials.map((w) => [w.number, w.relative])).toEqual([
      [46, -1],
      [47, 0],
      [48, 1],
    ]);
    expect(options.materialCategories.find((c) => c.id === legume.id)?.storageSubzoneId).toBe(legumerie.id);
  });
});
