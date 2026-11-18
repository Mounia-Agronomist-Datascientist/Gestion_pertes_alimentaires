import { describe, expect, it } from "vitest";
import { flushQueue, memoryStore, type QueuedItem, stamp } from "@/modules/declarations/offline-queue";

const item = (id: string, enteredAt: string, userId = "u1"): QueuedItem => ({
  id,
  userId,
  kind: "une",
  payloads: [{ id }],
  summary: id,
  enteredAt,
  status: "attente",
  attempts: 0,
});

describe("file d'attente hors ligne", () => {
  it("garde l'identifiant et l'heure de saisie d'une perte renvoyée", () => {
    const first = stamp({ quantity: 2 }, new Date("2026-11-05T09:00:00Z"));
    expect(first.enteredAt).toBe("2026-11-05T09:00:00.000Z");
    expect(first.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(stamp(first, new Date("2026-11-05T10:00:00Z"))).toEqual(first);
  });

  it("envoie dans l'ordre de saisie, retire les pertes reçues, garde les refusées avec leur motif", async () => {
    const store = memoryStore([
      item("b", "2026-11-05T09:05:00Z"),
      item("a", "2026-11-05T09:00:00Z"),
      item("x", "2026-11-05T08:00:00Z", "u2"),
    ]);
    const sent: string[] = [];
    const r = await flushQueue(store, "u1", async (i) => {
      sent.push(i.id);
      return i.id === "b" ? { ok: false, error: "Cause désactivée" } : { ok: true };
    });
    expect(sent).toEqual(["a", "b"]);
    expect(r).toEqual({ sent: 1, refused: 1, offline: false, authRequired: false });
    const left = await store.all();
    // La perte d'un autre compte n'est pas envoyée.
    expect(left.map((i) => [i.id, i.status, i.error ?? null]).sort()).toEqual([
      ["b", "refusee", "Cause désactivée"],
      ["x", "attente", null],
    ]);
  });

  it("s'arrête au premier défaut de réseau et garde tout ce qui reste", async () => {
    const store = memoryStore([item("a", "1"), item("b", "2")]);
    const r = await flushQueue(store, "u1", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r).toMatchObject({ sent: 0, offline: true });
    expect((await store.all()).map((i) => [i.id, i.status, i.attempts]).sort()).toEqual([
      ["a", "attente", 1],
      ["b", "attente", 0],
    ]);
  });

  it("session expirée : rien n'est perdu", async () => {
    const store = memoryStore([item("a", "1")]);
    expect(await flushQueue(store, "u1", async () => ({ ok: false, error: "", authRequired: true }))).toMatchObject({
      authRequired: true,
      sent: 0,
    });
    expect(await store.all()).toHaveLength(1);
  });
});
