import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { pdfText } from "@/modules/rapports/pdf";
import { buildReport, REPORT_TYPES } from "@/modules/rapports/reports";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { weekCatalogs } from "@/modules/imports/catalog";
import { buildWeekImport } from "@/modules/imports/merge";
import { parsePlan } from "@/modules/imports/plan/parse-plan";
import { saveWeekImport } from "@/modules/imports/service";
import { extractPdfItems } from "@/modules/imports/tome/pdf-items";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { statsContext } from "@/modules/statistiques/context";
import { s45PlanGrid, s45TomeItems } from "../helpers/s45";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T14:00:00Z");

describe("rapports PDF", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamD: AuthUser;

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
    const vi01 = (await weekCatalogs(t.db, teamD, "2026-11-02"))[0]!.dishes.find((d) => d.code === "VI01")!.id;
    const ref = {
      cuisine: await id(t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE"))),
      cause: await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION"))),
      tgtg: await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "TGTG"))),
      compost: await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES"))),
    };
    await createDeclaration(
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
        destinations: [
          { destinationId: ref.tgtg, quantity: 6, recoveredAmountEur: 4.5 },
          { destinationId: ref.compost, quantity: 4 },
        ],
      },
      NOW,
    );
  });

  afterAll(async () => {
    await t.close();
  });

  const textOf = async (bytes: Uint8Array) => (await extractPdfItems(bytes.slice())).map((i) => i.text).join(" ");
  const params = { periode: "semaine", annee: "2026", semaine: "45" };

  it("produit les cinq rapports, lisibles, avec les chiffres de la période", async () => {
    const ctx = await statsContext(t.db, admin, params);
    for (const type of REPORT_TYPES) {
      const report = await buildReport(t.db, admin, type, ctx, new Date("2026-11-13T10:00:00Z"));
      expect(report, type).not.toBeNull();
      expect(Buffer.from(report!.bytes.slice(0, 5)).toString()).toBe("%PDF-");
      const text = await textOf(report!.bytes);
      expect(text, type).toContain("La Brigade de Véro");
      expect(text, type).toContain("13/11/2026");
    }
    const weekly = await buildReport(t.db, admin, "hebdomadaire", ctx);
    expect(weekly!.name).toBe("rapport-hebdomadaire-s45-2026");
    const text = await textOf(weekly!.bytes);
    expect(text).toContain("Rapport hebdomadaire des pertes");
    expect(text).toContain("S45-2026");
    expect(text).toContain("13,30"); // coût brut des 10 barquettes de VI01
    expect(text).toContain("Les 12 dernières semaines");
    expect((await buildReport(t.db, admin, "mensuel", ctx))!.name).toBe("rapport-mensuel-novembre-2026");
    expect((await buildReport(t.db, admin, "annuel", ctx))!.name).toBe("rapport-annuel-2026");
    expect(await textOf((await buildReport(t.db, admin, "valorisation", ctx))!.bytes)).toContain("Too Good To Go");
    expect(await textOf((await buildReport(t.db, admin, "environnemental", ctx))!.bytes)).toContain("Rapprochement avec Les Alchimistes");
  });

  it("une équipe n'a ni euros ni rapprochement des Alchimistes", async () => {
    const ctx = await statsContext(t.db, teamD, params);
    const weekly = await textOf((await buildReport(t.db, teamD, "hebdomadaire", ctx))!.bytes);
    expect(weekly).toContain("Équipe D");
    expect(weekly).not.toContain("€");
    expect(weekly).not.toContain("Coût brut");
    const env = await textOf((await buildReport(t.db, teamD, "environnemental", ctx))!.bytes);
    expect(env).toContain("Réservé aux vues d'entreprise");
  });

  it("rend le texte compatible avec les polices standard du PDF", () => {
    expect(pdfText("1 234,5 kg ▲ +12 % → S46 🟢 œuf −3")).toBe("1 234,5 kg + +12 % -> S46 œuf -3");
  });
});
