import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { AGRIBALYSE_PROPOSAL } from "@/modules/environnement/agribalyse-proposal";
import { createFamily, listFamiliesForAdmin, loadAgribalyseProposal, proposeFactor, rejectFactor, retainedValue, validateFactors, validFactors } from "@/modules/environnement/factors";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-13T10:00:00Z");

describe("facteurs d'émission", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let team: AuthUser;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    const [teamD] = await t.db.select().from(s.teams).where(eq(s.teams.letter, "D"));
    team = await loadAuthUser(t.db, await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: teamD!.id, password: "mot-de-passe-equipe" }));
  });

  afterAll(async () => {
    await t.close();
  });

  const beef = async () => (await listFamiliesForAdmin(t.db, admin)).find((f) => f.code === "BOEUF")!;

  it("retient les étapes jusqu'au transport (sans distribution ni consommation)", () => {
    expect(retainedValue({ agriculture: 28.3, transformation: 0.116, emballage: 0.2, transport: 0.293, distribution: 0.0406, consommation: 0.00683 })).toBe(28.909);
    expect(AGRIBALYSE_PROPOSAL.find((p) => p.code === "BOEUF")).toMatchObject({ agb: "6111", product: "Boeuf, faux-filet, cru" });
  });

  it("charge la proposition Agribalyse une seule fois, sans rien valider", async () => {
    expect(await loadAgribalyseProposal(t.db, admin, NOW)).toEqual({ createdFamilies: AGRIBALYSE_PROPOSAL.length, proposed: AGRIBALYSE_PROPOSAL.length });
    expect(await loadAgribalyseProposal(t.db, admin, NOW)).toEqual({ createdFamilies: 0, proposed: 0 });
    const family = await beef();
    expect(family.current).toBeNull();
    expect(family.proposal).toMatchObject({ version: 1, status: "propose", kgCo2ePerKg: 28.909, source: "AGRIBALYSE (ADEME), détail par étape", sourceVersion: "3.2", referenceCode: "6111" });
    expect(family.proposal!.hypotheses).toMatch(/DQR/);
    expect((await validFactors(t.db)).size).toBe(0);
    await expect(loadAgribalyseProposal(t.db, team, NOW)).rejects.toThrow();
  });

  it("valide, puis garde l'ancienne version quand une nouvelle est validée", async () => {
    const first = (await beef()).proposal!;
    expect(await validateFactors(t.db, admin, [first.id], NOW)).toBe(1);
    expect((await validFactors(t.db)).get(first.familyId)?.kgCo2ePerKg).toBe(28.909);
    await expect(validateFactors(t.db, admin, [first.id], NOW)).rejects.toThrow(/déjà traitée/);

    const later = new Date("2026-11-14T10:00:00Z");
    await proposeFactor(t.db, admin, first.familyId, { kgCo2ePerKg: 27.5, source: "Fiche fournisseur", sourceVersion: null, referenceName: "Bœuf haché 15 %", hypotheses: "Valeur communiquée par le fournisseur pour 2027." }, later);
    // Une nouvelle proposition remplace la précédente en attente.
    const second = await proposeFactor(t.db, admin, first.familyId, { kgCo2ePerKg: 26, source: "Fiche fournisseur", sourceVersion: "2027", referenceName: null, hypotheses: "Valeur corrigée par le fournisseur." }, later);
    await validateFactors(t.db, admin, [second.id], later);
    const family = await beef();
    expect(family.versions.map((v) => [v.version, v.status, v.kgCo2ePerKg])).toEqual([
      [3, "valide", 26],
      [2, "refuse", 27.5],
      [1, "remplace", 28.909],
    ]);
    expect(family.versions[2]!.closedAt).toEqual(later);
  });

  it("refuse une proposition et vérifie la saisie", async () => {
    const veal = (await listFamiliesForAdmin(t.db, admin)).find((f) => f.code === "VEAU")!;
    await rejectFactor(t.db, admin, veal.proposal!.id, NOW);
    expect((await listFamiliesForAdmin(t.db, admin)).find((f) => f.code === "VEAU")!.proposal).toBeNull();
    await expect(proposeFactor(t.db, admin, veal.id, { kgCo2ePerKg: -1, source: "Test", sourceVersion: null, referenceName: null, hypotheses: "Hypothèse de test." })).rejects.toThrow(/négative/);
    await expect(proposeFactor(t.db, admin, veal.id, { kgCo2ePerKg: 3, source: "", sourceVersion: null, referenceName: null, hypotheses: "Hypothèse de test." })).rejects.toThrow(/source/);
  });

  it("crée une famille sans facteur, à compléter avec une valeur sourcée", async () => {
    const family = await createFamily(t.db, admin, { name: "Champignons", category: "Légumes" }, NOW);
    expect(family).toMatchObject({ code: "CHAMPIGNONS", name: "Champignons", category: "Légumes" });
    await expect(createFamily(t.db, admin, { name: "champignons", category: "Légumes" }, NOW)).rejects.toThrow(/existe déjà/);
    await expect(createFamily(t.db, team, { name: "Vanille", category: "Épices" }, NOW)).rejects.toThrow();
    const listed = (await listFamiliesForAdmin(t.db, admin)).find((f) => f.id === family.id)!;
    expect(listed).toMatchObject({ current: null, proposal: null, versions: [] });
  });
});
