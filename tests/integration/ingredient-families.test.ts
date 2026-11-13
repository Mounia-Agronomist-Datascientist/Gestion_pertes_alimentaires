import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { loadAgribalyseProposal } from "@/modules/environnement/factors";
import { listIngredientsForMapping, saveIngredientMappings } from "@/modules/environnement/ingredients";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-13T10:00:00Z");

describe("rattachement des ingrédients Melba", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let team: AuthUser;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    const [teamD] = await t.db.select().from(s.teams).where(eq(s.teams.letter, "D"));
    team = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: teamD!.id, password: "mot-de-passe-equipe" }));
    await saveWeekImport(t.db, admin, { preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())), tomeFileName: "t.pdf", planFileName: "p.xlsx", planSheetName: "S45" });
  });

  afterAll(async () => {
    await t.close();
  });

  const familyId = async (code: string) => (await t.db.select().from(s.foodFamilies).where(eq(s.foodFamilies.code, code)))[0]!.id;

  it("liste les ingrédients des imports en vigueur, les plus utilisés d'abord, sans sous-recettes", async () => {
    const rows = await listIngredientsForMapping(t.db, admin);
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.map((r) => r.uses)).toEqual([...rows.map((r) => r.uses)].sort((a, b) => b - a));
    const ingredients = new Set((await t.db.select().from(s.weekRecipeLines).where(eq(s.weekRecipeLines.isSubRecipe, false))).map((l) => l.key));
    expect(rows.every((r) => ingredients.has(r.key))).toBe(true);
    // Sans familles chargées, aucune suggestion de famille.
    expect(rows.every((r) => r.suggestion == null || r.suggestion.kind === "non_alimentaire")).toBe(true);
    await expect(listIngredientsForMapping(t.db, team)).rejects.toThrow();
  });

  it("suggère une famille une fois la proposition chargée, enregistre et modifie un rattachement", async () => {
    await loadAgribalyseProposal(t.db, admin, NOW);
    const rows = await listIngredientsForMapping(t.db, admin);
    const salt = rows.find((r) => r.key === "sel fin")!;
    expect(salt.suggestion).toMatchObject({ kind: "famille", code: "SEL", familyId: await familyId("SEL") });
    expect(salt.mapping).toBeNull();

    const pepper = rows.find((r) => r.key.startsWith("poivre noir"));
    const entries = [
      { key: salt.key, label: salt.label, status: "famille" as const, familyId: salt.suggestion!.kind === "famille" ? salt.suggestion!.familyId! : null },
      ...(pepper ? [{ key: pepper.key, label: pepper.label, status: "non_couvert" as const, familyId: null }] : []),
    ];
    expect(await saveIngredientMappings(t.db, admin, entries, NOW)).toBe(entries.length);
    // Rien ne change : rien n'est réenregistré.
    expect(await saveIngredientMappings(t.db, admin, entries, NOW)).toBe(0);
    const after = await listIngredientsForMapping(t.db, admin);
    expect(after.find((r) => r.key === "sel fin")!.mapping).toMatchObject({ status: "famille", familyId: await familyId("SEL") });

    await saveIngredientMappings(t.db, admin, [{ key: salt.key, label: salt.label, status: "non_couvert", familyId: null }], NOW);
    const [row] = await t.db.select().from(s.ingredientFamilies).where(eq(s.ingredientFamilies.ingredientKey, "sel fin"));
    expect(row).toMatchObject({ status: "non_couvert", familyId: null });
    const audit = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, row!.id));
    expect(audit.map((a) => a.action).sort()).toEqual(["create", "update"]);
  });

  it("exige une famille pour le statut « famille »", async () => {
    await expect(saveIngredientMappings(t.db, admin, [{ key: "x", label: "x", status: "famille", familyId: null }], NOW)).rejects.toThrow(/famille/);
    await expect(saveIngredientMappings(t.db, admin, [{ key: "x", label: "x", status: "famille", familyId: "00000000-0000-4000-8000-000000000000" }], NOW)).rejects.toThrow(/introuvable/);
  });
});
