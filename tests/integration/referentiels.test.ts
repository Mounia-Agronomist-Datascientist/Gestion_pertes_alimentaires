import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed, zoneIdByCode } from "@/db/seed/seed";
import { createTestDb } from "../helpers/test-db";

describe("données initiales des référentiels", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
  });

  afterAll(async () => {
    await t.close();
  });

  it("est idempotent : un second passage ne crée aucun doublon", async () => {
    await seed(t.db);
    expect(await t.db.$count(s.teams)).toBe(8);
    expect(await t.db.$count(s.containerTares)).toBe(8);
    expect(await t.db.$count(s.zones)).toBe(5);
  });

  it("crée les 8 équipes avec lettre et couleur", async () => {
    const teams = await t.db.select().from(s.teams).orderBy(s.teams.displayOrder);
    expect(teams.map((x) => x.letter).join("")).toBe("ABCDEFGH");
    // Aucun prénom dans l'application (décision du 06/11/2026).
    expect(teams[2]).toMatchObject({ colorName: "Rose", managersLabel: null });
  });

  it("sépare l'épicerie des deux stockages secs extérieurs", async () => {
    const stockage = await zoneIdByCode(t.db, "STOCKAGE");
    const subs = await t.db.select().from(s.subzones).where(eq(s.subzones.zoneId, stockage));
    expect(subs).toHaveLength(7);
    expect(subs.map((x) => x.code)).toEqual(expect.arrayContaining(["STO_EPICERIE", "STO_SEC_ENCAS", "STO_SEC_PROD"]));
  });

  it("exige une équipe en Cuisine / Production uniquement", async () => {
    const subs = await t.db
      .select({ zone: s.zones.code, mode: s.subzones.teamMode })
      .from(s.subzones)
      .innerJoin(s.zones, eq(s.subzones.zoneId, s.zones.id));
    for (const sub of subs) {
      expect(sub.mode).toBe(sub.zone === "CUISINE" ? "equipe" : "zone");
    }
  });

  it("partage une même cause entre plusieurs zones (Fond de gastro : Conditionnement et Plonge)", async () => {
    const rows = await t.db
      .select({ zone: s.zones.code })
      .from(s.causeZones)
      .innerJoin(s.causes, eq(s.causeZones.causeId, s.causes.id))
      .innerJoin(s.zones, eq(s.causeZones.zoneId, s.zones.id))
      .where(eq(s.causes.code, "FOND_GASTRO"));
    expect(rows.map((r) => r.zone).sort()).toEqual(["CONDITIONNEMENT", "PLONGE"]);
  });

  it("restreint « Chutes de découpe » au déboîtage", async () => {
    const rows = await t.db
      .select({ subzone: s.subzones.code })
      .from(s.causeSubzones)
      .innerJoin(s.causes, eq(s.causeSubzones.causeId, s.causes.id))
      .innerJoin(s.subzones, eq(s.causeSubzones.subzoneId, s.subzones.id))
      .where(eq(s.causes.code, "CUI_CHUTES_DECOUPE"));
    expect(rows).toEqual([{ subzone: "CUI_DEBOITAGE" }]);
  });

  it("a une seule cause « Autres pertes »", async () => {
    const others = await t.db.select().from(s.causes).where(eq(s.causes.isOther, true));
    expect(others).toHaveLength(1);
  });

  it("n'autorise la recette récupérée que pour les ventes", async () => {
    const recov = await t.db.select().from(s.destinations).where(eq(s.destinations.financialRecovery, true));
    expect(recov.map((d) => d.code).sort()).toEqual(["TGTG", "VENTE_FLASH"]);
    await expect(
      t.db.insert(s.destinations).values({ code: "X", name: "X", kind: "don", financialRecovery: true }),
    ).rejects.toThrow();
  });

  it("enregistre les tares du fichier de référence, versionnées", async () => {
    const [g4] = await t.db
      .select({ tare: s.containerTares.unitTareKg, max: s.containerTypes.maxCount })
      .from(s.containerTares)
      .innerJoin(s.containerTypes, eq(s.containerTares.containerTypeId, s.containerTypes.id))
      .where(and(eq(s.containerTypes.code, "GASTRO_4"), isNull(s.containerTares.validTo)));
    expect(g4).toEqual({ tare: 2.25, max: 30 });
  });

  it("pré-génère le calendrier de production 2025 à 2028", async () => {
    const [s46] = await t.db
      .select()
      .from(s.productionWeeks)
      .where(and(eq(s.productionWeeks.year, 2026), eq(s.productionWeeks.number, 46)));
    expect(s46?.startDate).toBe("2026-11-05");
  });

  it("donne toutes les permissions à l'administrateur et aucune écriture à la direction", async () => {
    const direction = await t.db.select().from(s.rolePermissions).where(eq(s.rolePermissions.roleCode, "direction"));
    expect(direction.map((p) => p.permissionCode)).not.toContain("declaration.create");
    expect(await t.db.$count(s.rolePermissions, eq(s.rolePermissions.roleCode, "admin"))).toBe(
      await t.db.$count(s.permissions),
    );
  });

  it("interdit un compte équipe sans équipe", async () => {
    await expect(
      t.db.insert(s.users).values({ login: "x", displayName: "X", passwordHash: "h", roleCode: "equipe" }),
    ).rejects.toThrow();
  });
});
