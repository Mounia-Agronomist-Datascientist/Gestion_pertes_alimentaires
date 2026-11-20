import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { getDeclarationDetail } from "@/modules/declarations/queries";
import { correctDeclaration, createDeclaration } from "@/modules/declarations/service";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { type SurplusPayload, saveSurplusImport, surplusCoverage } from "@/modules/imports/surplus/service";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { buildReport } from "@/modules/rapports/reports";
import { statsContext } from "@/modules/statistiques/context";
import { statsExport } from "@/modules/statistiques/exports";
import { canReadSurplus, surplusDashboard } from "@/modules/statistiques/surplus";
import { extractPdfItems } from "@/modules/imports/tome/pdf-items";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T14:00:00Z");
const S45 = { kind: "semaine", year: 2026, number: 45 } as const;

const entry = (
  e: Partial<SurplusPayload["entries"][number]> & Pick<SurplusPayload["entries"][number], "kind" | "date">,
): SurplusPayload["entries"][number] => ({
  trays: 0,
  breakfastTrays: 0,
  offeredTrays: null,
  boxes: null,
  breakfastBoxes: null,
  formula: null,
  amountEur: null,
  code: null,
  note: null,
  dishName: null,
  lot: null,
  dishCode: null,
  producedOn: null,
  bestBefore: null,
  collected: null,
  ...e,
});

describe("ventes et dons des surplus (fichiers de l'entreprise)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamD: AuthUser;
  let vi01: { portionWeightG: number | null; totalWeightG: number | null; totalCostEur: number | null };

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    admin = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "admin",
        displayName: "Administration",
        roleCode: "admin",
        password: "mot-de-passe-admin",
      }),
    );
    teamD = await loadAuthUser(
      t.db,
      await createAccount(t.db, {
        login: "equipe-d",
        displayName: "Équipe D",
        roleCode: "equipe",
        teamId: await id(t.db.select().from(s.teams).where(eq(s.teams.letter, "D"))),
        password: "mot-de-passe-equipe",
      }),
    );
    await saveWeekImport(t.db, admin, {
      preview: buildWeekImport(parseTome(s45TomeItems()), parsePlan("S45", s45PlanGrid())),
      tomeFileName: "t.pdf",
      planFileName: "p.xlsx",
      planSheetName: "S45",
    });
    vi01 = (
      await t.db
        .select({
          portionWeightG: s.weekRecipes.portionWeightG,
          totalWeightG: s.weekRecipes.totalWeightG,
          totalCostEur: s.weekRecipes.totalCostEur,
        })
        .from(s.weekRecipes)
        .where(eq(s.weekRecipes.code, "VI01"))
    )[0]!;
  });

  afterAll(async () => {
    await t.close();
  });

  it("Linkee : retrouve le plat Melba par le lot et fige poids et coût", async () => {
    const saved = await saveSurplusImport(
      t.db,
      admin,
      {
        source: "linkee",
        fileName: "linkee.xlsx",
        sheets: ["Linkee"],
        periodFrom: "2026-11-02",
        periodTo: "2026-11-02",
        entries: [
          entry({
            kind: "don",
            date: "2026-11-02",
            trays: 36,
            dishName: "Plat VI01",
            lot: "L45-301026-L1-VI01",
            dishCode: "VI01",
            producedOn: "2026-10-30",
            collected: true,
          }),
          // Date de production illisible : semaine 45 lue dans le lot.
          entry({
            kind: "don",
            date: "2026-11-02",
            trays: 12,
            dishName: "Plat VI01 bis",
            lot: "L45-3010260-L1-VI01",
            dishCode: "VI01",
            collected: false,
          }),
          entry({
            kind: "don",
            date: "2026-11-02",
            trays: 24,
            dishName: "Plat inconnu",
            lot: "L45-301026-L1-ZZ99",
            dishCode: "ZZ99",
            producedOn: "2026-10-30",
            collected: true,
          }),
          entry({
            kind: "don",
            date: "2026-11-02",
            trays: 100,
            dishName: "Yaourt nature",
            lot: "20260203",
            collected: true,
          }),
        ],
        warnings: [],
      },
      NOW,
    );
    expect(saved).toMatchObject({ entries: 4, matched: 2, unmatched: 1, outside: 0, replaced: 0 });
    const rows = await t.db.select().from(s.surplusEntries).where(eq(s.surplusEntries.source, "linkee"));
    const grams = vi01.portionWeightG ?? vi01.totalWeightG!;
    const first = rows.find((r) => r.dishName === "Plat VI01")!;
    expect(first.netKg).toBeCloseTo((36 * grams) / 1000, 3);
    expect(first.costEur).toBeCloseTo(36 * vi01.totalCostEur!, 2);
    expect(rows.find((r) => r.dishName === "Plat VI01 bis")!.costEur).toBeCloseTo(12 * vi01.totalCostEur!, 2);
    expect(rows.find((r) => r.dishName === "Plat inconnu")!.costEur).toBeNull();
    expect(rows.every((r) => r.productionWeekId != null)).toBe(true);
  });

  it("TGTG et ventes flash : un nouveau fichier remplace sa période, sans toucher aux autres sources", async () => {
    const tgtg = (amount: number): SurplusPayload => ({
      source: "tgtg",
      fileName: "tgtg.xlsx",
      sheets: ["TGTG2026"],
      periodFrom: "2026-10-30",
      periodTo: "2026-11-03",
      entries: [
        entry({ kind: "vente", date: "2026-10-30", trays: 100, offeredTrays: 120, formula: "6P", amountEur: amount }),
        entry({
          kind: "vente",
          date: "2026-11-03",
          trays: 60,
          offeredTrays: 60,
          formula: "2P + 1 encas",
          amountEur: null,
        }),
        entry({ kind: "versement", date: "2026-11-02", amountEur: 3434.08 }),
      ],
      warnings: [],
    });
    await saveSurplusImport(t.db, admin, tgtg(400), NOW);
    const second = await saveSurplusImport(t.db, admin, tgtg(416.5), NOW);
    expect(second.replaced).toBe(3);
    await saveSurplusImport(
      t.db,
      admin,
      {
        source: "vente_flash",
        fileName: "vf.xlsx",
        sheets: ["VF2026"],
        periodFrom: "2026-10-30",
        periodTo: "2026-10-30",
        entries: [
          entry({
            kind: "vente",
            date: "2026-10-30",
            boxes: 21,
            breakfastBoxes: 6,
            trays: 210,
            breakfastTrays: 30,
            formula: "10P / 10P + PDJ",
            amountEur: 1490,
            code: "VF301026",
          }),
        ],
        warnings: [],
      },
      NOW,
    );
    const inForce = await t.db
      .select()
      .from(s.surplusEntries)
      .where(and(eq(s.surplusEntries.source, "tgtg"), isNull(s.surplusEntries.replacedByImportId)));
    expect(inForce.map((r) => r.amountEur).sort()).toEqual([3434.08, 416.5, null].sort());
    expect(
      await t.db.select().from(s.surplusEntries).where(isNotNull(s.surplusEntries.replacedByImportId)),
    ).toHaveLength(3);
    expect(await surplusCoverage(t.db, admin)).toEqual({
      linkee: { from: "2026-11-02", to: "2026-11-02", entries: 4 },
      tgtg: { from: "2026-10-30", to: "2026-11-03", entries: 3 },
      vente_flash: { from: "2026-10-30", to: "2026-10-30", entries: 1 },
    });
  });

  it("tableau de bord : totaux par canal, montants séparés, toute l'entreprise seulement", async () => {
    const data = await surplusDashboard(t.db, admin, S45, { year: 2026, number: 45 });
    expect(data.totals.tgtg).toEqual({
      sales: 2,
      offeredTrays: 180,
      trays: 160,
      clientEur: 416.5,
      missingAmount: 1,
      payouts: 1,
      receivedEur: 3434.08,
    });
    expect(data.totals.flash).toEqual({
      sales: 1,
      boxes: 21,
      breakfastBoxes: 6,
      trays: 210,
      breakfastTrays: 30,
      revenueEur: 1490,
      missingAmount: 0,
    });
    expect(data.totals.linkee).toMatchObject({
      collections: 1,
      dishes: 4,
      trays: 172,
      notCollectedTrays: 12,
      weighedTrays: 48,
      costedTrays: 48,
    });
    expect(data.totals.linkee.costEur).toBeCloseTo(48 * vi01.totalCostEur!, 2);
    expect(data.series.at(-1)!.totals.tgtg.trays).toBe(160);
    expect(canReadSurplus(teamD)).toBe(false);
    await expect(surplusDashboard(t.db, teamD, S45, null)).rejects.toThrow();
  });

  it("export et rapport de valorisation reprennent les fichiers", async () => {
    const ctx = await statsContext(t.db, admin, { periode: "semaine", annee: "2026", semaine: "45" });
    const exported = await statsExport(t.db, admin, "valorisation", ctx, {});
    const table = exported!.tables.find((x) => x.title.startsWith("Ventes et dons des surplus"))!;
    expect(table.headers).toContain("TGTG versements reçus HT (€)");
    expect(table.rows[0]).toContain(3434.08);
    const report = await buildReport(t.db, admin, "valorisation", ctx);
    const text = (await extractPdfItems(report!.bytes.slice())).map((i) => i.text).join(" ");
    expect(text).toContain("Ventes et dons des surplus de barquettes");
    expect(text).toContain("reçu HT après commission");
    const teamReport = await buildReport(
      t.db,
      teamD,
      "valorisation",
      await statsContext(t.db, teamD, { periode: "semaine", annee: "2026", semaine: "45" }),
    );
    expect((await extractPdfItems(teamReport!.bytes.slice())).map((i) => i.text).join(" ")).not.toContain(
      "Ventes et dons des surplus",
    );
  });

  it("saisie : Too Good To Go, vente flash et Linkee ne sont plus proposés, sauf pour corriger une ancienne déclaration", async () => {
    const dest = async (code: string) =>
      (await t.db.select().from(s.destinations).where(eq(s.destinations.code, code)))[0]!;
    const [tgtg, linkee, compost] = await Promise.all([dest("TGTG"), dest("LINKEE"), dest("ALCHIMISTES")]);
    expect(linkee).toMatchObject({ kind: "don", financialRecovery: false, declarable: false });
    const options = await getDeclarationOptions(t.db, teamD, "2026-11-02");
    expect(options.destinations.map((d) => d.id)).not.toContain(tgtg.id);
    expect(options.destinations.map((d) => d.id)).not.toContain(linkee.id);
    expect((await getDeclarationOptions(t.db, teamD, "2026-11-02", [tgtg.id])).destinations.map((d) => d.id)).toContain(
      tgtg.id,
    );

    const vi01Id = (await weekCatalogs(t.db, teamD, "2026-11-02"))[0]!.dishes.find((d) => d.code === "VI01")!.id;
    const cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_DEBOITAGE")))[0]!.id;
    const cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")))[0]!.id;
    const input = (destinations: { destinationId: string; quantity: number }[]) => ({
      occurredOn: "2026-11-02",
      subzoneId: cuisine,
      product: { weekItem: { kind: "plat" as const, id: vi01Id } },
      method: "comptage" as const,
      quantity: 10,
      unitCode: "piece",
      causeId: cause,
      destinations,
    });
    await expect(
      createDeclaration(t.db, teamD, input([{ destinationId: tgtg.id, quantity: 10 }]), NOW),
    ).rejects.toThrow(/plus déclarée par les équipes/);

    // Déclaration faite avant le 13/11/2026 avec Too Good To Go : sa correction garde la destination.
    await t.db.update(s.destinations).set({ declarable: true }).where(eq(s.destinations.id, tgtg.id));
    const old = await createDeclaration(t.db, teamD, input([{ destinationId: tgtg.id, quantity: 10 }]), NOW);
    await t.db.update(s.destinations).set({ declarable: false }).where(eq(s.destinations.id, tgtg.id));
    await correctDeclaration(
      t.db,
      teamD,
      old.id,
      input([
        { destinationId: tgtg.id, quantity: 6 },
        { destinationId: compost.id, quantity: 4 },
      ]),
      { reason: "Répartition corrigée", expectedRevision: 1 },
      NOW,
    );
    const detail = await getDeclarationDetail(t.db, teamD, old.id, NOW);
    expect(detail!.destinations.map((d) => d.destinationId).sort()).toEqual([tgtg.id, compost.id].sort());
  });
});
