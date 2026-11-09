import { describe, expect, it } from "vitest";
import { importPayloadSchema } from "@/modules/imports/payload";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";

describe("données envoyées par l'écran d'import", () => {
  const payload = {
    tome: parseTome(s45TomeItems()),
    plan: parsePlan("S45", s45PlanGrid()),
    tomeFileName: "Melba _ Imprimer les recettes.pdf",
    planFileName: "Plan de production.xlsx",
    planSheetName: "S45",
  };

  it("accepte une semaine réelle telle que lue dans le navigateur, sans la modifier", () => {
    const parsed = importPayloadSchema.safeParse(JSON.parse(JSON.stringify(payload)));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(payload);
  });

  it("refuse des données mal formées (code de plat, équipe, nombres)", () => {
    const bad = structuredClone(payload);
    bad.plan.groups[0]!.team = "Z";
    expect(importPayloadSchema.safeParse(bad).success).toBe(false);
    const bad2 = structuredClone(payload);
    bad2.tome.recipes[0]!.code = "<script>";
    expect(importPayloadSchema.safeParse(bad2).success).toBe(false);
    expect(importPayloadSchema.safeParse({ ...payload, tome: { ...payload.tome, recipes: "x" } }).success).toBe(false);
  });
});
