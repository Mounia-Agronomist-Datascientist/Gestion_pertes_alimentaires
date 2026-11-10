import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration, setRecoveredAmounts } from "@/modules/declarations/service";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T14:00:00Z");

describe("recettes récupérées et coût net", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamD: AuthUser;
  let ref: Record<string, string>;
  let vi01: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamD = await loadAuthUser(
      t.db,
      await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: await id(t.db.select().from(s.teams).where(eq(s.teams.letter, "D"))), password: "mot-de-passe-equipe" }),
    );
    await saveWeekImport(t.db, admin, { preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())), tomeFileName: "t.pdf", planFileName: "p.xlsx", planSheetName: "S45" });
    vi01 = (await weekCatalogs(t.db, teamD, "2026-11-02"))[0]!.dishes.find((d) => d.code === "VI01")!.id;
    ref = {
      cuisine: await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE"))),
      cause: await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION"))),
      tgtg: await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "TGTG"))),
      compost: await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES"))),
    };
  });

  afterAll(async () => {
    await t.close();
  });

  const declare = (destinations: object[]) =>
    createDeclaration(
      t.db,
      teamD,
      {
        occurredOn: "2026-11-02",
        subzoneId: ref.cuisine,
        product: { weekItem: { kind: "plat", id: vi01 } },
        method: "comptage",
        quantity: 10,
        unitCode: "barquette",
        causeId: ref.cause,
        destinations,
      },
      NOW,
    );
  const load = async (id: string) => (await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, id)))[0]!;

  it("montant encaissé saisi à la déclaration : coût net = brut − recettes", async () => {
    const r = await declare([
      { destinationId: ref.tgtg, quantity: 6, recoveredAmountEur: 4.5 },
      { destinationId: ref.compost, quantity: 4 },
    ]);
    expect(await load(r.id)).toMatchObject({ grossCostEur: 13.3, recoveredEur: 4.5, netCostEur: 8.8 });
  });

  it("refuse un montant sur une destination qui n'est pas une vente", async () => {
    await expect(declare([{ destinationId: ref.compost, quantity: 10, recoveredAmountEur: 2 }])).rejects.toThrow(/ne rapporte pas de recette/);
  });

  it("recette complétée plus tard : nouvelle version, coût brut inchangé", async () => {
    const r = await declare([{ destinationId: ref.tgtg, quantity: 10 }]);
    expect(await load(r.id)).toMatchObject({ recoveredEur: null, netCostEur: 13.3 });
    await setRecoveredAmounts(t.db, admin, r.id, { expectedRevision: 1, amounts: { [ref.tgtg!]: 7.99 } }, NOW);
    const after = await load(r.id);
    expect(after).toMatchObject({ revision: 2, status: "corrigee", grossCostEur: 13.3, recoveredEur: 7.99, netCostEur: 5.31 });
    const [line] = await t.db
      .select()
      .from(s.declarationDestinations)
      .where(and(eq(s.declarationDestinations.declarationId, r.id), eq(s.declarationDestinations.revision, 2)));
    expect(line?.recoveredAmount).toBe(7.99);
    const [rev] = await t.db.select().from(s.declarationRevisions).where(and(eq(s.declarationRevisions.declarationId, r.id), eq(s.declarationRevisions.revision, 2)));
    expect(rev?.reason).toBe("Recette encaissée");
    await expect(setRecoveredAmounts(t.db, admin, r.id, { expectedRevision: 1, amounts: { [ref.tgtg!]: 1 } }, NOW)).rejects.toThrow();
    await expect(setRecoveredAmounts(t.db, admin, r.id, { expectedRevision: 2, amounts: { [ref.compost!]: 1 } }, NOW)).rejects.toThrow(/introuvable|recette/);
  });
});
