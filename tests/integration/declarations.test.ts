import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { ForbiddenError } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration, DeclarationError } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

// Jeudi 12/11/2026 à 10h (Paris) : semaine S47.
const NOW = new Date("2026-11-12T09:00:00Z");
const PASSWORD = "mot-de-passe-test";

describe("déclaration de perte", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  const id: Record<string, string> = {};
  let teamC: AuthUser;
  let respCond: AuthUser;
  let respPlonge: AuthUser;
  let admin: AuthUser;
  let direction: AuthUser;

  /** Identifiant d'un élément du référentiel par « type:code » ; échoue si absent. */
  function ref(key: string): string {
    const value = id[key];
    if (!value) throw new Error(`Référence de test inconnue : ${key}`);
    return value;
  }

  async function byCode<T extends { id: string; code: string | null }>(rows: T[], prefix: string) {
    for (const r of rows) if (r.code) id[`${prefix}:${r.code}`] = r.id;
  }

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    await byCode(await t.db.select().from(s.subzones), "sz");
    await byCode(await t.db.select().from(s.zones), "zone");
    await byCode(await t.db.select().from(s.causes), "cause");
    await byCode(await t.db.select().from(s.destinations), "dest");
    await byCode(await t.db.select().from(s.containerTypes), "ct");
    for (const team of await t.db.select().from(s.teams)) id[`team:${team.letter}`] = team.id;

    // Produits de test (fictifs).
    const inserted = await t.db
      .insert(s.products)
      .values([
        { category: "sous_recette", code: "T-PUREE", name: "Purée test", defaultUnit: "kg" },
        { category: "produit_fini", code: "T-BARQ", name: "Barquette test", defaultUnit: "barquette", unitWeightKg: 0.35 },
        { category: "sous_recette", code: "T-SAUCE", name: "Sauce test", defaultUnit: "l", densityKgPerL: 1.05 },
        { category: "consommable", code: "T-FILM", name: "Film test", defaultUnit: "piece" },
      ])
      .returning();
    await byCode(inserted, "product");

    const mk = async (login: string, roleCode: string, extra: object = {}) =>
      loadAuthUser(t.db, await createAccount(t.db, { login, displayName: login, roleCode, password: PASSWORD, ...extra }));
    teamC = await mk("equipe-c", "equipe", { teamId: ref("team:C") });
    respCond = await mk("resp-cond", "resp_zone", { zoneIds: [ref("zone:CONDITIONNEMENT")] });
    respPlonge = await mk("resp-plonge", "resp_zone", { zoneIds: [ref("zone:PLONGE")] });
    admin = await mk("admin", "admin");
    direction = await mk("direction", "direction");
  });

  afterAll(async () => {
    await t.close();
  });

  /** Déclaration minimale valide en cuisine, modifiable par cas de test. */
  function cuisine(overrides: Record<string, unknown> = {}) {
    return {
      occurredOn: "2026-11-12",
      subzoneId: ref("sz:CUI_CUISINE"),
      product: { productId: ref("product:T-PUREE") },
      method: "pesee",
      quantity: 4.2,
      unitCode: "kg",
      causeId: ref("cause:ERREUR_PREPARATION"),
      destinations: [{ destinationId: ref("dest:ALCHIMISTES"), quantity: 4.2 }],
      ...overrides,
    };
  }

  async function load(declarationId: string) {
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, declarationId));
    return row!;
  }

  describe("attribution", () => {
    it("en cuisine, un compte équipe déclare pour son équipe (imposée par la session)", async () => {
      const r = await createDeclaration(t.db, teamC, cuisine({ teamId: ref("team:A") }), NOW);
      const row = await load(r.id);
      expect(row.teamId).toBe(ref("team:C"));
      expect(row.responsibility).toBe("equipe");
      expect(row.createdBy).toBe(teamC.id);
    });

    it("hors cuisine, la perte d'une équipe est attribuée à la zone, l'équipe restant l'auteur", async () => {
      const r = await createDeclaration(
        t.db,
        teamC,
        cuisine({
          subzoneId: ref("sz:CON_BARQUETTES"),
          product: { productId: ref("product:T-BARQ") },
          method: "comptage",
          quantity: 10,
          unitCode: "barquette",
          causeId: ref("cause:CON_SCELLAGE"),
          destinations: [{ destinationId: ref("dest:ORDURES"), quantity: 10 }],
        }),
        NOW,
      );
      const row = await load(r.id);
      expect(row).toMatchObject({ teamId: null, responsibility: "zone", createdBy: teamC.id });
    });

    it("un responsable de cuisine (admin) doit choisir l'équipe", async () => {
      await expect(createDeclaration(t.db, admin, cuisine(), NOW)).rejects.toThrow(/Choisissez l'équipe/);
      const r = await createDeclaration(t.db, admin, cuisine({ teamId: ref("team:B") }), NOW);
      expect((await load(r.id)).teamId).toBe(ref("team:B"));
    });

    it("un responsable de zone ne déclare que dans sa zone", async () => {
      await expect(createDeclaration(t.db, respPlonge, cuisine({ teamId: ref("team:B") }), NOW)).rejects.toThrow(/vos zones/);
    });

    it("la direction ne peut pas déclarer", async () => {
      await expect(createDeclaration(t.db, direction, cuisine(), NOW)).rejects.toThrow(ForbiddenError);
    });

    it("refuse une équipe désactivée pour la semaine", async () => {
      const [s47] = await t.db
        .select()
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 47)));
      await t.db.insert(s.teamWeekStatus).values({ teamId: ref("team:H"), productionWeekId: s47!.id, active: false });
      await expect(createDeclaration(t.db, admin, cuisine({ teamId: ref("team:H") }), NOW)).rejects.toThrow(/pas active/);
    });
  });

  describe("semaines et déclarations tardives", () => {
    it("rattache la perte à la semaine de sa date réelle", async () => {
      const r = await createDeclaration(t.db, teamC, cuisine(), NOW);
      expect(r.isLate).toBe(false);
    });

    it("signale une perte de la semaine précédente comme tardive, sans changer sa date", async () => {
      const r = await createDeclaration(t.db, teamC, cuisine({ occurredOn: "2026-11-11" }), NOW);
      const row = await load(r.id);
      expect(r.isLate).toBe(true);
      expect(row.occurredOn).toBe("2026-11-11");
      expect(row.productionWeekId).not.toBe(row.declaredWeekId);
    });

    it("refuse une date dans le futur", async () => {
      await expect(createDeclaration(t.db, teamC, cuisine({ occurredOn: "2026-11-13" }), NOW)).rejects.toThrow(/futur/);
    });
  });

  describe("quantités", () => {
    it("pesée en gastros sur échelle : tare déduite et versions de tare conservées", async () => {
      const r = await createDeclaration(
        t.db,
        teamC,
        cuisine({
          quantity: null,
          unitCode: null,
          tare: {
            grossKg: 60,
            gastros: [{ containerTypeId: ref("ct:GASTRO_1"), count: 10 }],
            supportTypeId: ref("ct:ECHELLE_CLASSIQUE"),
          },
          destinations: [{ destinationId: ref("dest:ALCHIMISTES"), quantity: 28 }],
        }),
        NOW,
      );
      const row = await load(r.id);
      expect(row).toMatchObject({ quantity: 60, tareTotalKg: 32, netQuantity: 28, netKg: 28, kgStatus: "pese" });
      const containers = await t.db
        .select()
        .from(s.declarationContainers)
        .where(eq(s.declarationContainers.declarationId, r.id));
      expect(containers.map((c) => c.tareKgSnapshot).sort((a, b) => a - b)).toEqual([11, 21]);
    });

    it("une tare modifiée après coup ne change pas la déclaration enregistrée", async () => {
      const r = await createDeclaration(
        t.db,
        teamC,
        cuisine({
          quantity: null,
          unitCode: null,
          tare: { grossKg: 10, gastros: [{ containerTypeId: ref("ct:GASTRO_4"), count: 2 }] },
          destinations: [{ destinationId: ref("dest:ALCHIMISTES"), quantity: 5.5 }],
        }),
        NOW,
      );
      const [current] = await t.db
        .select()
        .from(s.containerTares)
        .where(eq(s.containerTares.containerTypeId, ref("ct:GASTRO_4")));
      await t.db.update(s.containerTares).set({ validTo: "2026-11-12" }).where(eq(s.containerTares.id, current!.id));
      await t.db
        .insert(s.containerTares)
        .values({ containerTypeId: ref("ct:GASTRO_4"), unitTareKg: 2.4, validFrom: "2026-11-13" });
      expect((await load(r.id)).netKg).toBe(5.5);
    });

    it("refuse un poids brut inférieur à la tare", async () => {
      await expect(
        createDeclaration(
          t.db,
          teamC,
          cuisine({ quantity: null, unitCode: null, tare: { grossKg: 2, gastros: [{ containerTypeId: ref("ct:GASTRO_1"), count: 3 }] } }),
          NOW,
        ),
      ).rejects.toThrow(/supérieur à la tare/);
    });

    it("convertit les barquettes avec le poids unitaire (méthode « conversion automatique »)", async () => {
      const r = await createDeclaration(
        t.db,
        respCond,
        cuisine({
          subzoneId: ref("sz:CON_BARQUETTES"),
          product: { productId: ref("product:T-BARQ") },
          method: "comptage",
          quantity: 12,
          unitCode: "barquette",
          causeId: ref("cause:CON_POIDS"),
          destinations: [
            { destinationId: ref("dest:PERSONNEL"), quantity: 8 },
            { destinationId: ref("dest:ORDURES"), quantity: 4 },
          ],
        }),
        NOW,
      );
      const row = await load(r.id);
      expect(row).toMatchObject({ netKg: 4.2, kgStatus: "converti", measurementMethod: "conversion_reference", conversionFactorUsed: 0.35 });
      const dest = await t.db.select().from(s.declarationDestinations).where(eq(s.declarationDestinations.declarationId, r.id));
      expect(dest.map((d) => d.netKg).sort()).toEqual([1.4, 2.8]);
    });

    it("convertit les litres avec la densité, jamais 1 L = 1 kg", async () => {
      const withDensity = await createDeclaration(
        t.db,
        teamC,
        cuisine({ product: { productId: ref("product:T-SAUCE") }, method: "estimation_manuelle", quantity: 2, unitCode: "l", destinations: [{ destinationId: ref("dest:ALCHIMISTES"), quantity: 2 }] }),
        NOW,
      );
      expect((await load(withDensity.id)).netKg).toBe(2.1);
      const freeLabel = await createDeclaration(
        t.db,
        teamC,
        cuisine({ product: { freeLabel: "Jus inconnu", category: "matiere_premiere" }, method: "estimation_manuelle", quantity: 2, unitCode: "l", destinations: [{ destinationId: ref("dest:ALCHIMISTES"), quantity: 2 }] }),
        NOW,
      );
      expect(await load(freeLabel.id)).toMatchObject({ netKg: null, kgStatus: "non_converti", productUnlisted: true, productName: "Jus inconnu" });
    });

    it("un consommable reste en unités, jamais en kg alimentaires", async () => {
      const r = await createDeclaration(
        t.db,
        respCond,
        cuisine({
          subzoneId: ref("sz:CON_BARQUETTES"),
          product: { productId: ref("product:T-FILM") },
          method: "comptage",
          quantity: 30,
          unitCode: "piece",
          causeId: ref("cause:CON_ETIQUETAGE"),
          destinations: [{ destinationId: ref("dest:ORDURES"), quantity: 30 }],
        }),
        NOW,
      );
      expect(await load(r.id)).toMatchObject({ netKg: null, kgStatus: "sans_objet" });
    });

    it("refuse une unité non proposée pour la méthode", async () => {
      await expect(createDeclaration(t.db, teamC, cuisine({ unitCode: "l" }), NOW)).rejects.toThrow(/Unité non proposée/);
    });
  });

  describe("causes", () => {
    it("refuse une cause d'une autre zone", async () => {
      await expect(createDeclaration(t.db, teamC, cuisine({ causeId: ref("cause:CON_SCELLAGE") }), NOW)).rejects.toThrow(/cette zone/);
    });

    it("« Chutes de découpe » n'est acceptée qu'au déboîtage", async () => {
      await expect(createDeclaration(t.db, teamC, cuisine({ causeId: ref("cause:CUI_CHUTES_DECOUPE") }), NOW)).rejects.toThrow(/sous-zone/);
      const r = await createDeclaration(
        t.db,
        teamC,
        cuisine({ subzoneId: ref("sz:CUI_DEBOITAGE"), causeId: ref("cause:CUI_CHUTES_DECOUPE") }),
        NOW,
      );
      expect(r.id).toBeTruthy();
    });

    it("« Autres pertes » est acceptée partout", async () => {
      const r = await createDeclaration(t.db, teamC, cuisine({ causeId: ref("cause:AUTRES"), comment: "Bac renversé" }), NOW);
      expect(await load(r.id)).toMatchObject({ causeName: "Autres pertes", comment: "Bac renversé" });
    });
  });

  describe("destinations", () => {
    it("répartit 20 kg entre quatre destinations", async () => {
      const r = await createDeclaration(
        t.db,
        teamC,
        cuisine({
          quantity: 20,
          destinations: [
            { destinationId: ref("dest:DON"), quantity: 5 },
            { destinationId: ref("dest:VENTE_FLASH"), quantity: 8 },
            { destinationId: ref("dest:REUTILISATION"), quantity: 4 },
            { destinationId: ref("dest:ALCHIMISTES"), quantity: 3 },
          ],
        }),
        NOW,
      );
      expect(await t.db.$count(s.declarationDestinations, eq(s.declarationDestinations.declarationId, r.id))).toBe(4);
    });

    it("exige une justification en cas d'écart, et la conserve", async () => {
      const unbalanced = cuisine({ quantity: 20, destinations: [{ destinationId: ref("dest:DON"), quantity: 17 }] });
      await expect(createDeclaration(t.db, teamC, unbalanced, NOW)).rejects.toThrow(/il reste 3 à affecter/);
      const r = await createDeclaration(t.db, teamC, { ...unbalanced, destinationGapJustification: "3 kg non récupérables" }, NOW);
      expect((await load(r.id)).destinationGapJustification).toBe("3 kg non récupérables");
    });
  });

  describe("historisation", () => {
    it("enregistre la version 1 complète et une entrée d'audit", async () => {
      const r = await createDeclaration(t.db, teamC, cuisine(), NOW);
      const [revision] = await t.db
        .select()
        .from(s.declarationRevisions)
        .where(eq(s.declarationRevisions.declarationId, r.id));
      expect(revision).toMatchObject({ revision: 1, status: "validee", changedBy: teamC.id });
      expect((revision!.data as { declaration: { productName: string } }).declaration.productName).toBe("Purée test");
      const audit = await t.db
        .select()
        .from(s.auditLog)
        .where(and(eq(s.auditLog.entity, "loss_declaration"), eq(s.auditLog.entityId, r.id)));
      expect(audit.map((a) => a.action)).toEqual(["create"]);
    });

    it("conserve le nom du produit au moment de la saisie (instantané)", async () => {
      const r = await createDeclaration(t.db, teamC, cuisine(), NOW);
      await t.db.update(s.products).set({ name: "Purée renommée" }).where(eq(s.products.id, ref("product:T-PUREE")));
      expect((await load(r.id)).productName).toBe("Purée test");
    });

    it("n'enregistre rien si la saisie est refusée", async () => {
      const before = await t.db.$count(s.lossDeclarations);
      await expect(createDeclaration(t.db, teamC, cuisine({ causeId: ref("cause:CON_SCELLAGE") }), NOW)).rejects.toThrow(DeclarationError);
      expect(await t.db.$count(s.lossDeclarations)).toBe(before);
    });
  });
});
