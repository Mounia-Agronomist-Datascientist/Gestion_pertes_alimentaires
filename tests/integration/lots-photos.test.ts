import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { seed } from "@/db/seed/seed";
import { createAccount } from "@/modules/auth/accounts";
import type { AuthUser } from "@/modules/auth/permissions";
import { loadAuthUser } from "@/modules/auth/service";
import { correctDeclaration, createDeclaration, purgeOldPhotos } from "@/modules/declarations/service";
import { createTestDb } from "../helpers/test-db";

/** Plus petit JPEG reconnu (en-tête FF D8 FF) : le contenu réel n'est pas relu par le serveur. */
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]).toString("base64")}`;

describe("n° de lot, DLC et photos (règle R37)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let admin: AuthUser;
  const NOW = new Date("2026-11-13T10:00:00Z");
  const id = async (table: typeof s.subzones | typeof s.causes | typeof s.destinations, code: string) =>
    (await t.db.select().from(table).where(eq(table.code, code)))[0]!.id;
  const input = async (
    extra: Record<string, unknown>,
    place: [string, string] = ["REC_RECEPTION", "REC_ETIQUETAGE"],
  ) => ({
    occurredOn: "2026-11-12",
    subzoneId: await id(s.subzones, place[0]),
    product: { freeLabel: "Carottes", category: "matiere_premiere" },
    method: "pesee",
    quantity: 50,
    unitCode: "kg",
    causeId: await id(s.causes, place[1]),
    destinations: [{ destinationId: await id(s.destinations, "ORDURES"), quantity: 50 }],
    ...extra,
  });
  const photosOf = async (declarationId: string) =>
    t.db.select().from(s.declarationPhotos).where(eq(s.declarationPhotos.declarationId, declarationId));

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

  const threeLots = [
    { lotNumber: "A123", dlc: "2026-11-25", quantity: 20 },
    { lotNumber: null, dlc: "2026-11-27", quantity: 20 },
    { lotNumber: "B77", dlc: null, quantity: 10 },
  ];

  it("enregistre plusieurs lots et une photo à la Réception", async () => {
    const r = await createDeclaration(t.db, admin, await input({ lots: threeLots, photos: [{ dataUrl: JPEG }] }), NOW);
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, r.id));
    expect(row!.lots).toEqual(threeLots);
    const photos = await photosOf(r.id);
    expect(photos).toHaveLength(1);
    expect(photos[0]!.contentType).toBe("image/jpeg");
    expect(photos[0]!.byteSize).toBe(12);
  });

  it("refuse une répartition qui ne fait pas la quantité de la perte", async () => {
    await expect(createDeclaration(t.db, admin, await input({ lots: threeLots.slice(0, 2) }), NOW)).rejects.toThrow(
      /il reste 10 à répartir/,
    );
  });

  it("refuse une photo qui n'est pas un JPEG", async () => {
    await expect(
      createDeclaration(t.db, admin, await input({ photos: [{ dataUrl: "data:image/jpeg;base64,AAAA" }] }), NOW),
    ).rejects.toThrow(/Photo illisible/);
  });

  it("seulement à la Réception et au Stockage", async () => {
    await expect(
      createDeclaration(
        t.db,
        admin,
        await input(
          {
            product: { freeLabel: "Barquettes", category: "produit_fini" },
            lots: [{ lotNumber: "X", dlc: null, quantity: 50 }],
          },
          ["CON_AUTRES", "CON_SURPRODUCTION"],
        ),
        NOW,
      ),
    ).rejects.toThrow(/Réception et au Stockage/);
  });

  it("au Stockage aussi, avec la nouvelle cause « 5. Retour non utilisable »", async () => {
    const r = await createDeclaration(
      t.db,
      admin,
      await input({ lots: [{ lotNumber: "C1", dlc: "2026-11-20", quantity: 50 }] }, [
        "STO_BOF",
        "STO_RETOUR_INUTILISABLE",
      ]),
      NOW,
    );
    const [row] = await t.db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, r.id));
    expect(row!.causeName).toBe("5. Retour non utilisable");
  });

  it("une correction garde les photos listées et retire les autres", async () => {
    const r = await createDeclaration(
      t.db,
      admin,
      await input({ photos: [{ dataUrl: JPEG }, { dataUrl: JPEG }] }),
      NOW,
    );
    const [first, second] = await photosOf(r.id);
    await correctDeclaration(
      t.db,
      admin,
      r.id,
      await input({ lots: [{ lotNumber: "Z9", dlc: null, quantity: 50 }], photos: [{ photoId: first!.id }] }),
      { reason: "Photo floue retirée", expectedRevision: 1 },
      NOW,
    );
    const after = await photosOf(r.id);
    expect(after.map((p) => p.id)).toEqual([first!.id]);
    expect(after.some((p) => p.id === second!.id)).toBe(false);
    await expect(
      correctDeclaration(
        t.db,
        admin,
        r.id,
        await input({ photos: [{ photoId: second!.id }] }),
        { reason: "Essai", expectedRevision: 2 },
        NOW,
      ),
    ).rejects.toThrow(/Photo introuvable/);
  });

  it("efface les photos de plus de 3 mois, le lot et la DLC restent", async () => {
    const before = (await t.db.select().from(s.declarationPhotos)).length;
    expect(before).toBeGreaterThan(0);
    expect(await purgeOldPhotos(t.db, new Date("2027-02-12T10:00:00Z"))).toBe(0);
    expect(await purgeOldPhotos(t.db, new Date("2027-02-14T10:00:00Z"))).toBe(before);
    const lots = await t.db.select({ lots: s.lossDeclarations.lots }).from(s.lossDeclarations);
    expect(lots.some((l) => l.lots?.some((x) => x.lotNumber === "A123"))).toBe(true);
  });
});
