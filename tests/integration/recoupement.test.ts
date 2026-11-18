import { readdirSync, readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { parsePurchaseOrder } from "@/modules/imports/bons-commande/parse-bon";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import type { PdfItem } from "@/modules/imports/tome/pdf-items";
import { savePurchaseOrders } from "@/modules/matieres/bons-commande";
import { ReconciliationError, reconciliationWeeks, weekReconciliation } from "@/modules/matieres/recoupement";
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

describe("recoupement de la semaine", () => {
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

  it("liste les semaines qui ont un tome ou des bons", async () => {
    const weeks = await reconciliationWeeks(t.db, admin);
    expect(weeks.map((w) => [`S${w.number}`, w.hasTome, w.orders])).toEqual([
      ["S48", false, 1],
      ["S47", false, 4],
      ["S46", false, 1],
      ["S45", true, 1],
      ["S11", false, 1],
    ]);
  });

  it("S45 : tome et bon de la semaine recoupés", async () => {
    const r = await weekReconciliation(t.db, admin, await weekId(45));
    expect(r).toMatchObject({ hasTome: true, orders: 1, orderLines: 4, matched: 4, notInTome: [] });
    expect(r.withoutOrder).toHaveLength(r.tomeIngredients - 4);
    // Un ingrédient du tome est rattaché à son plat ou à sa sous-recette.
    expect(r.withoutOrder.every((m) => m.usedIn.length > 0)).toBe(true);
    for (const g of r.priceGaps) expect(Math.abs(g.gap)).toBeGreaterThan(0.005);
  });

  it("S47 sans tome : les commandes citées par un autre tome le disent", async () => {
    const r = await weekReconciliation(t.db, admin, await weekId(47));
    expect(r).toMatchObject({ hasTome: false, tomeIngredients: 0, matched: 0, withoutOrder: [], priceGaps: [] });
    expect(r.notInTome).toHaveLength(r.orderLines);
    const garlic = r.notInTome.find((l) => l.designation === "ail pelé");
    expect(garlic?.otherTomes).toEqual(["S45-2026"]);
    expect(JSON.stringify(r)).not.toMatch(/@/);
  });

  it("refuse une semaine inconnue et un compte sans droit", async () => {
    await expect(weekReconciliation(t.db, admin, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      ReconciliationError,
    );
    await expect(
      reconciliationWeeks(t.db, { ...admin, permissions: new Set() } as unknown as AuthUser),
    ).rejects.toThrow();
  });
});
