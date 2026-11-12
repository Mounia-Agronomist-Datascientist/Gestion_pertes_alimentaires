import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { lastBinNumbers } from "@/modules/declarations/options";
import { getDeclarationDetail } from "@/modules/declarations/queries";
import { cancelDeclaration, correctDeclaration, createDeclaration } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-02T14:00:00Z");

describe("n° de poubelle des Alchimistes", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  let team: AuthUser;
  let input: (destinations: object[]) => object;
  let alchimistes: string;
  let ordures: string;
  let zoneId: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const id = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows)[0]!.id;
    admin = await loadAuthUser(t.db, await createAccount(t.db, { login: "admin", displayName: "Administration", roleCode: "admin", password: "mot-de-passe-admin" }));
    team = await loadAuthUser(
      t.db,
      await createAccount(t.db, { login: "equipe-d", displayName: "Équipe D", roleCode: "equipe", teamId: await id(t.db.select().from(s.teams).where(eq(s.teams.letter, "D"))), password: "mot-de-passe-equipe" }),
    );
    const [cuisine] = await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE"));
    zoneId = cuisine!.zoneId;
    const cause = await id(t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")));
    alchimistes = await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")));
    ordures = await id(t.db.select().from(s.destinations).where(eq(s.destinations.code, "ORDURES")));
    input = (destinations) => ({
      occurredOn: "2026-11-02",
      subzoneId: cuisine!.id,
      product: { freeLabel: "Carottes", category: "matiere_premiere" },
      method: "pesee",
      quantity: 2,
      unitCode: "kg",
      causeId: cause,
      destinations,
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it("est facultatif pour Les Alchimistes en attendant les n° des bacs collectés", async () => {
    const [row] = await t.db.select().from(s.destinations).where(eq(s.destinations.id, alchimistes));
    expect(row!.binNumberMode).toBe("facultatif");
    const without = await createDeclaration(t.db, team, input([{ destinationId: alchimistes, quantity: 2, binNumber: "  " }]), NOW);
    expect((await getDeclarationDetail(t.db, team, without.id, NOW))!.destinations[0]!.binNumber).toBeNull();
    await cancelDeclaration(t.db, admin, without.id, { reason: "Essai", expectedRevision: 1 }, NOW);
  });

  it("peut redevenir obligatoire, et n'est demandé que pour Les Alchimistes", async () => {
    await t.db.update(s.destinations).set({ binNumberMode: "obligatoire" }).where(eq(s.destinations.id, alchimistes));
    await expect(createDeclaration(t.db, team, input([{ destinationId: alchimistes, quantity: 2 }]), NOW)).rejects.toThrow(/n° de la poubelle/);
    await expect(createDeclaration(t.db, team, input([{ destinationId: alchimistes, quantity: 2, binNumber: "  " }]), NOW)).rejects.toThrow(/n° de la poubelle/);
    await t.db.update(s.destinations).set({ binNumberMode: "facultatif" }).where(eq(s.destinations.id, alchimistes));
    const other = await createDeclaration(t.db, team, input([{ destinationId: ordures, quantity: 2, binNumber: "7" }]), NOW);
    const detail = await getDeclarationDetail(t.db, team, other.id, NOW);
    expect(detail!.destinations[0]!.binNumber).toBeNull();
  });

  it("est enregistré, gardé à la correction et à l'annulation, et proposé pour la perte suivante de la zone", async () => {
    const first = await createDeclaration(t.db, team, input([{ destinationId: alchimistes, quantity: 2, binNumber: "12" }]), NOW);
    expect((await getDeclarationDetail(t.db, team, first.id, NOW))!.destinations[0]!.binNumber).toBe("12");
    expect((await lastBinNumbers(t.db, [zoneId]))[zoneId]?.[alchimistes]).toBe("12");

    const later = new Date("2026-11-02T15:00:00Z");
    const second = await createDeclaration(t.db, team, input([{ destinationId: alchimistes, quantity: 2, binNumber: "13" }]), later);
    expect((await lastBinNumbers(t.db, [zoneId]))[zoneId]?.[alchimistes]).toBe("13");

    await correctDeclaration(t.db, team, first.id, input([{ destinationId: alchimistes, quantity: 2, binNumber: "12" }]), { reason: "Repesé", expectedRevision: 1 }, later);
    expect((await getDeclarationDetail(t.db, team, first.id, later))!.destinations[0]!.binNumber).toBe("12");
    await cancelDeclaration(t.db, admin, second.id, { reason: "Doublon", expectedRevision: 1 }, later);
    expect((await getDeclarationDetail(t.db, admin, second.id, later))!.destinations[0]!.binNumber).toBe("13");
    // Une perte annulée ne sert plus de référence : on revient à la poubelle 12.
    expect((await lastBinNumbers(t.db, [zoneId]))[zoneId]?.[alchimistes]).toBe("12");
  });
});
