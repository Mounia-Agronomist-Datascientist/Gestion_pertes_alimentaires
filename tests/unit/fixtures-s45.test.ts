import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Garde-fou sur l'extrait S45 : il sert de référence aux futurs tests d'import (Phase 2).
const dir = "tests/fixtures/s45";
const plan = JSON.parse(readFileSync(`${dir}/plan-production-S45.json`, "utf8")) as {
  blocks: Record<string, { rows: string[][] }>;
};
const tome = readFileSync(`${dir}/tome-S45.txt`, "utf8");

const CODE = /^[A-Z]{2}\d{2}/;
const planCodes = ["plats", "petitsDejeuners"].flatMap((b) =>
  plan.blocks[b]!.rows.filter((r) => r[0] && CODE.test(r[0])).flatMap((r) => r[0]!.split("/")),
);
const tomeCodes = [...tome.matchAll(/^2026 S45_([A-Z]{2}\d{2})/gm)].map((m) => m[1]!);

describe("extrait de test S45", () => {
  it("contient 60 plats affectés à une équipe et 82 recettes au tome", () => {
    expect(new Set(planCodes).size).toBe(60);
    expect(tomeCodes).toHaveLength(82);
  });

  it("chaque plat du plan a sa recette au tome ; seuls les encas (EN) ne sont pas affectés à une équipe", () => {
    expect(planCodes.filter((c) => !tomeCodes.includes(c))).toEqual([]);
    expect(new Set(tomeCodes.filter((c) => !planCodes.includes(c)).map((c) => c.slice(0, 2)))).toEqual(new Set(["EN"]));
  });

  it("chaque groupe de plats a une équipe A à H", () => {
    const rows = plan.blocks.plats!.rows.filter((r) => r[0] && CODE.test(r[0]));
    expect(rows.every((r) => /^[A-H]$/.test(r[15] ?? ""))).toBe(true);
  });

  it("ne contient ni lien d'impression Melba ni adresse e-mail", () => {
    expect(tome).not.toMatch(/melba\.io/);
    expect(tome + JSON.stringify(plan)).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});
