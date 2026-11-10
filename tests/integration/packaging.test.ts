import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import {
  createPackagingItem,
  listPackaging,
  portionPackagingCost,
  setPackagingCost,
  setPackagingItemActive,
  setPackagingPerPortion,
  updatePackagingItem,
} from "@/modules/admin/packaging";
import { createAccount } from "@/modules/auth/accounts";
import { ForbiddenError, type AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createTestDb } from "../helpers/test-db";

const TODAY = "2026-11-10";

describe("référentiel des emballages", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let teamUser: AuthUser;
  let barquette: string;
  let film: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const teamC = (await t.db.select().from(s.teams).where(eq(s.teams.letter, "C")))[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    teamUser = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-c", displayName: "Équipe C", roleCode: "equipe", teamId: teamC, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  it("crée des emballages (code en majuscules, doublons refusés)", async () => {
    barquette = (await createPackagingItem(t.db, admin, { code: "barq-310", name: "Barquette 310 mL", kind: "barquette", unit: "pièce", supplier: "" })).id;
    film = (await createPackagingItem(t.db, admin, { code: "FILM", name: "Film d'operculage", kind: "film", unit: "pièce" })).id;
    const [row] = await t.db.select().from(s.packagingItems).where(eq(s.packagingItems.id, barquette));
    expect(row).toMatchObject({ code: "BARQ-310", supplier: null });
    await expect(createPackagingItem(t.db, admin, { code: "BARQ-310", name: "Autre", kind: "barquette", unit: "pièce" })).rejects.toThrow(/code/);
    await expect(createPackagingItem(t.db, admin, { code: "X2", name: "barquette 310 ml", kind: "barquette", unit: "pièce" })).rejects.toThrow(/existe déjà/);
    await updatePackagingItem(t.db, admin, film, { name: "Film d'operculage 2", kind: "film", unit: "pièce", supplier: "Fournisseur X" });
  });

  it("coûts datés : nouvelle version, correction avant entrée en vigueur, jamais de réécriture d'un coût appliqué", async () => {
    await setPackagingCost(t.db, admin, barquette, { unitCostEur: "0,12", validFrom: "2026-11-01" }, TODAY);
    await setPackagingCost(t.db, admin, barquette, { unitCostEur: "0,13", validFrom: "2026-12-01" }, TODAY);
    await setPackagingCost(t.db, admin, barquette, { unitCostEur: "0,125", validFrom: "2026-12-01", note: "Erreur" }, TODAY);
    await expect(setPackagingCost(t.db, admin, barquette, { unitCostEur: "0,2", validFrom: "2026-11-15" }, TODAY)).rejects.toThrow(/plus récent/);
    await expect(setPackagingCost(t.db, admin, film, { unitCostEur: "-1", validFrom: TODAY }, TODAY)).rejects.toThrow(/coût unitaire/);
    const { items } = await listPackaging(t.db, admin, TODAY);
    const b = items.find((i) => i.id === barquette)!;
    expect(b.current?.unitCostEur).toBe(0.12);
    expect(b.versions.map((v) => [v.unitCostEur, v.validFrom, v.validTo])).toEqual([
      [0.125, "2026-12-01", null],
      [0.12, "2026-11-01", "2026-11-30"],
    ]);
    // Le coût du 01/11 est appliqué depuis 9 jours : il ne peut plus être corrigé à la même date.
    await setPackagingCost(t.db, admin, film, { unitCostEur: "0,03", validFrom: "2026-11-01" }, TODAY);
    await expect(setPackagingCost(t.db, admin, film, { unitCostEur: "0,04", validFrom: "2026-11-01" }, TODAY)).rejects.toThrow(/déjà appliqué/);
  });

  it("calcule le coût des emballages d'une portion à une date, et signale un coût manquant", async () => {
    await setPackagingPerPortion(t.db, admin, { portionKind: "plat", itemId: barquette, quantity: "1" });
    await setPackagingPerPortion(t.db, admin, { portionKind: "plat", itemId: film, quantity: "1" });
    expect(await portionPackagingCost(t.db, "plat", "2026-11-05")).toMatchObject({ totalEur: 0.15, complete: true });
    expect((await portionPackagingCost(t.db, "plat", "2026-12-05")).totalEur).toBe(0.155);
    expect(await portionPackagingCost(t.db, "plat", "2026-10-15")).toMatchObject({ totalEur: 0, complete: false });
    expect(await portionPackagingCost(t.db, "petit_dejeuner", "2026-11-05")).toEqual({ totalEur: 0, lines: [], complete: true });

    await setPackagingPerPortion(t.db, admin, { portionKind: "plat", itemId: film, quantity: "" });
    expect((await portionPackagingCost(t.db, "plat", "2026-11-05")).lines.map((l) => l.code)).toEqual(["BARQ-310"]);
    await setPackagingItemActive(t.db, admin, barquette, false);
    expect((await portionPackagingCost(t.db, "plat", "2026-11-05")).lines).toEqual([]);
  });

  it("réserve le référentiel à l'administration", async () => {
    await expect(createPackagingItem(t.db, teamUser, { code: "Z1", name: "Zzz", kind: "autre", unit: "pièce" })).rejects.toThrow(ForbiddenError);
    await expect(listPackaging(t.db, teamUser, TODAY)).rejects.toThrow(ForbiddenError);
  });
});
