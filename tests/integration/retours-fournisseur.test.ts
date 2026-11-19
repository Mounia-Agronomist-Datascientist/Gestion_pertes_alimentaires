import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { weekCostSummary } from "@/modules/couts/summary";
import { createDeclaration } from "@/modules/declarations/service";
import { generalDashboard } from "@/modules/statistiques/dashboard";
import { loadFacts } from "@/modules/statistiques/facts";
import { createTestDb } from "../helpers/test-db";

describe("Réception : retours fournisseur à part, devenirs de la zone, « Autre destination » commentée", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const NOW = new Date("2026-11-13T10:00:00Z");
  const WEEK = { kind: "periode", from: "2026-11-12", to: "2026-11-18" } as const;
  const id = async (table: typeof s.subzones | typeof s.causes | typeof s.destinations, code: string) =>
    (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;
  const loss = async (
    subzone: string,
    cause: string,
    lines: [string, number][],
    extra: { comment?: string; product?: string } = {},
  ) =>
    createDeclaration(
      t.db,
      admin,
      {
        occurredOn: "2026-11-12",
        subzoneId: await id(s.subzones, subzone),
        product: { freeLabel: extra.product ?? "Carottes", category: "matiere_premiere" },
        method: "pesee",
        quantity: lines.reduce((n, [, q]) => n + q, 0),
        unitCode: "kg",
        causeId: await id(s.causes, cause),
        destinations: await Promise.all(
          lines.map(async ([code, quantity]) => ({
            destinationId: await id(s.destinations, code),
            quantity,
            binNumber: code === "ALCHIMISTES" ? "1" : undefined,
          })),
        ),
        comment: extra.comment,
      },
      NOW,
    );

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

  it("le serveur refuse un retour hors Réception et une réutilisation en Réception", async () => {
    await expect(loss("STO_BOF", "STO_PEREMPTION", [["RETOUR_FOURNISSEUR", 1]])).rejects.toThrow(
      /n'est pas proposée dans la zone/,
    );
    await expect(loss("REC_RECEPTION", "REC_ARRIVE_CASSE", [["REUTILISATION", 1]])).rejects.toThrow(
      /n'est pas proposée dans la zone/,
    );
  });

  it("« Autre destination » sans commentaire est refusée", async () => {
    await expect(loss("REC_RECEPTION", "REC_ARRIVE_CASSE", [["AUTRE", 1]])).rejects.toThrow(/Précisez/);
    await loss("REC_RECEPTION", "REC_ARRIVE_CASSE", [["AUTRE", 1]], { comment: "Laissé au transporteur" });
  });

  it("les retours fournisseur sortent du total perdu et sont donnés à part", async () => {
    await loss("REC_RECEPTION", "REC_ARRIVE_CASSE", [["RETOUR_FOURNISSEUR", 5]], { product: "Lait" });
    await loss(
      "REC_RECEPTION",
      "REC_DESSOUVIDE",
      [
        ["RETOUR_FOURNISSEUR", 3],
        ["ALCHIMISTES", 2],
      ],
      { product: "Poulet" },
    );
    const losses = await loadFacts(t.db, admin, WEEK);
    expect(losses.reduce((n, f) => n + (f.netKg ?? 0), 0)).toBe(3); // 1 kg « Autre » + 2 kg compost
    const dashboard = await generalDashboard(t.db, admin, WEEK, {});
    expect(dashboard.current.foodKg).toBe(3);
    expect(dashboard.supplierReturns).toMatchObject({ events: 2, foodKg: 8 });
    const reception = dashboard.zoneFlow.find((z) => z.name === "Réception")!;
    expect(reception).toMatchObject({ kg: 3, returned: { kg: 8, events: 2 } });
    expect((await loadFacts(t.db, admin, WEEK, {}, "tout")).reduce((n, f) => n + (f.netKg ?? 0), 0)).toBe(11);

    const week = (await t.db.select().from(s.lossDeclarations))[0]!.productionWeekId;
    expect((await weekCostSummary(t.db, admin, week)).netKg).toBe(3);
  });
});
