import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { setCauseClassification, validateProposedClassifications } from "@/modules/admin/causes";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration } from "@/modules/declarations/service";
import { generalDashboard } from "@/modules/statistiques/dashboard";
import { createTestDb } from "../helpers/test-db";

describe("famille de cause racine et pertes évitables (décision du 23/11/2026)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const NOW = new Date("2026-11-13T10:00:00Z");
  const cause = async (code: string) => (await t.db.select().from(s.causes).where(eq(s.causes.code, code)))[0]!;
  const id = async (table: typeof s.subzones | typeof s.destinations, code: string) =>
    (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;

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

  it("classement proposé au départ, puis validé ou corrigé par l'administration", async () => {
    expect(await cause("CON_SURPRODUCTION")).toMatchObject({
      family: "surproduction",
      avoidability: "evitable",
      classificationValidated: false,
    });
    expect(await cause("CON_TEST_OXYGENE")).toMatchObject({ family: "inherente", avoidability: "inevitable" });

    const surplus = await cause("CON_SURPRODUCTION");
    await setCauseClassification(t.db, admin, surplus.id, { family: "surproduction", avoidability: "a_evaluer" });
    expect(await cause("CON_SURPRODUCTION")).toMatchObject({
      avoidability: "a_evaluer",
      classificationValidated: true,
    });
    await expect(
      setCauseClassification(t.db, admin, surplus.id, { family: "inconnue", avoidability: "evitable" }),
    ).rejects.toThrow(/famille/);

    expect(await validateProposedClassifications(t.db, admin)).toBeGreaterThan(10);
    expect(await cause("CON_TEST_OXYGENE")).toMatchObject({ classificationValidated: true });
  });

  it("étape 2 : causes ajoutées zone par zone, avec leur famille", async () => {
    const zonesOf = async (code: string) =>
      (
        await t.db
          .select({ zone: s.zones.code })
          .from(s.causeZones)
          .innerJoin(s.zones, eq(s.zones.id, s.causeZones.zoneId))
          .where(eq(s.causeZones.causeId, (await cause(code)).id))
      )
        .map((r) => r.zone)
        .sort();
    expect(await cause("STO_NUISIBLES")).toMatchObject({
      family: "hygiene",
      avoidability: "evitable",
      status: "active",
    });
    expect(await cause("CUI_PROTECTION_GASTRO")).toMatchObject({ family: "hygiene", avoidability: "evitable" });
    expect(await cause("CON_REGLAGE_LIGNE")).toMatchObject({ family: "equipement_process", avoidability: "a_evaluer" });
    expect(await zonesOf("PANNE_EQUIPEMENT")).toEqual(["CONDITIONNEMENT"]);
    expect(await zonesOf("CUI_PANNE_MACHINE")).toEqual(["CUISINE"]);
    expect(await zonesOf("REC_CORPS_ETRANGER")).toEqual(["RECEPTION"]);
  });

  it("les statistiques lisent la famille et le caractère évitable de la cause", async () => {
    const loss = async (causeCode: string, kg: number) =>
      createDeclaration(
        t.db,
        admin,
        {
          occurredOn: "2026-11-12",
          subzoneId: await id(s.subzones, "CON_AUTRES"),
          product: { freeLabel: "Produit test", category: "matiere_premiere" },
          method: "pesee",
          quantity: kg,
          unitCode: "kg",
          causeId: (await cause(causeCode)).id,
          destinations: [{ destinationId: await id(s.destinations, "ORDURES"), quantity: kg }],
        },
        NOW,
      );
    await loss("CON_TEST_OXYGENE", 2);
    await loss("CON_ETIQUETAGE", 3);
    const dashboard = await generalDashboard(t.db, admin, { kind: "semaine", year: 2026, number: 47 }, {});
    expect(Object.fromEntries(dashboard.lenses.byAvoidability.map((g) => [g.key, g.summary.foodKg]))).toEqual({
      evitable: 3,
      inevitable: 2,
    });
    expect(Object.fromEntries(dashboard.lenses.byFamily.map((g) => [g.key, g.summary.foodKg]))).toEqual({
      organisation: 3,
      inherente: 2,
    });
  });
});
