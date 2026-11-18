import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { createDeclaration, createDeclarationBatch } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

describe("pertes saisies hors ligne puis envoyées", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let teamC: AuthUser;
  let teamA: AuthUser;
  let cuisine: string;
  let cause: string;
  let compost: string;

  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
    const team = async (letter: string) => (await t.db.select().from(s.teams).where(eq(s.teams.letter, letter)))[0]!.id;
    cuisine = (await t.db.select().from(s.subzones).where(eq(s.subzones.code, "CUI_CUISINE")))[0]!.id;
    cause = (await t.db.select().from(s.causes).where(eq(s.causes.code, "ERREUR_PREPARATION")))[0]!.id;
    compost = (await t.db.select().from(s.destinations).where(eq(s.destinations.code, "ALCHIMISTES")))[0]!.id;
    const mk = async (login: string, letter: string) =>
      loadAuthUser(
        t.db,
        await createAccount(t.db, {
          login,
          displayName: login,
          roleCode: "equipe",
          teamId: await team(letter),
          password: "mot-de-passe-test",
        }),
      );
    teamC = await mk("equipe-c", "C");
    teamA = await mk("equipe-a", "A");
  });

  afterAll(async () => {
    await t.close();
  });

  const input = (occurredOn: string, extra: Record<string, unknown> = {}) => ({
    occurredOn,
    subzoneId: cuisine,
    product: { freeLabel: "Carottes", category: "matiere_premiere" },
    method: "pesee",
    quantity: 2,
    unitCode: "kg",
    causeId: cause,
    destinations: [{ destinationId: compost, quantity: 2, binNumber: "1" }],
    ...extra,
  });
  const row = async (id: string) =>
    (await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, id)))[0]!;

  it("garde l'heure de saisie de l'appareil et l'heure de réception", async () => {
    const entered = "2026-11-05T09:12:00.000Z";
    const d = await createDeclaration(
      t.db,
      teamC,
      input("2026-11-05", { clientId: crypto.randomUUID(), enteredAt: entered }),
      new Date("2026-11-05T09:20:00Z"),
    );
    const r = await row(d.id);
    expect(r.declaredAt.toISOString()).toBe(entered);
    expect(r.receivedAt?.toISOString()).toBe("2026-11-05T09:20:00.000Z");
    // Envoyée tout de suite : pas d'heure de réception distincte.
    const now = new Date("2026-11-05T10:00:00Z");
    const direct = await createDeclaration(
      t.db,
      teamC,
      input("2026-11-05", { clientId: crypto.randomUUID(), enteredAt: "2026-11-05T09:59:50Z" }),
      now,
    );
    expect((await row(direct.id)).receivedAt).toBeNull();
  });

  it("n'enregistre qu'une fois une perte envoyée deux fois", async () => {
    const clientId = crypto.randomUUID();
    const now = new Date("2026-11-05T11:00:00Z");
    const first = await createDeclaration(
      t.db,
      teamC,
      input("2026-11-05", { clientId, enteredAt: "2026-11-05T10:58:00Z" }),
      now,
    );
    const second = await createDeclaration(
      t.db,
      teamC,
      input("2026-11-05", { clientId, enteredAt: "2026-11-05T10:58:00Z" }),
      new Date("2026-11-05T11:05:00Z"),
    );
    expect(second.id).toBe(first.id);
    expect(await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.clientId, clientId))).toHaveLength(
      1,
    );
    // Un autre compte ne peut pas réutiliser l'identifiant.
    await expect(createDeclaration(t.db, teamA, input("2026-11-05", { clientId }), now)).rejects.toThrow(
      /déjà utilisé/,
    );
  });

  it("compte le délai de 7 jours depuis l'heure de saisie", async () => {
    // Perte du 29/10 saisie le 05/11 (dans le délai), reçue le 07/11 : acceptée.
    const d = await createDeclaration(
      t.db,
      teamC,
      input("2026-10-29", { clientId: crypto.randomUUID(), enteredAt: "2026-11-05T15:00:00Z" }),
      new Date("2026-11-07T08:00:00Z"),
    );
    expect(d.id).toBeTruthy();
    // La même perte saisie directement le 07/11 : hors délai.
    await expect(createDeclaration(t.db, teamC, input("2026-10-29"), new Date("2026-11-07T08:00:00Z"))).rejects.toThrow(
      /plus de 7 jours/,
    );
  });

  it("refuse une heure de saisie dans le futur ou trop ancienne", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    await expect(
      createDeclaration(t.db, teamC, input("2026-11-05", { enteredAt: "2026-11-05T12:10:00Z" }), now),
    ).rejects.toThrow(/en avance/);
    // Quelques minutes d'avance sont tolérées (horloges différentes) : comptée à l'heure de réception.
    const d = await createDeclaration(t.db, teamC, input("2026-11-05", { enteredAt: "2026-11-05T12:03:00Z" }), now);
    expect((await row(d.id)).declaredAt.toISOString()).toBe(now.toISOString());
    await expect(
      createDeclaration(t.db, teamC, input("2026-10-27", { enteredAt: "2026-10-27T12:00:00Z" }), now),
    ).rejects.toThrow(/il y a plus de 7 jours sur cet appareil/);
  });

  it("série renvoyée : les lignes déjà reçues ne sont pas réenregistrées", async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    const now = new Date("2026-11-05T14:00:00Z");
    const lines = ids.map((clientId) => input("2026-11-05", { clientId, enteredAt: "2026-11-05T13:50:00Z" }));
    const first = await createDeclarationBatch(t.db, teamC, lines, now);
    const again = await createDeclarationBatch(t.db, teamC, lines, new Date("2026-11-05T14:02:00Z"));
    expect(again.map((d) => d.id).sort()).toEqual(first.map((d) => d.id).sort());
    expect(await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.clientId, ids[0]!))).toHaveLength(
      1,
    );
  });
});
