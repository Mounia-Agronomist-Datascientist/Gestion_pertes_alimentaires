/**
 * File d'attente des pertes saisies sans réseau (docs/PHASE6.md, étape 6.5), sur l'appareil.
 *
 * - Une perte (ou une série) validée pendant une coupure est gardée ici avec son identifiant d'appareil et son
 *   heure de saisie, puis envoyée au retour du réseau. Elle survit à la veille et à la fermeture de l'application
 *   (IndexedDB).
 * - Chaque compte n'envoie que ses propres pertes (appareil partagé entre équipes).
 * - Une perte refusée par le serveur reste dans la file, « à corriger », avec le motif ; un défaut de réseau arrête
 *   l'envoi jusqu'à la prochaine tentative ; une session expirée demande de se reconnecter, sans rien perdre.
 * Code exécuté dans le navigateur seulement.
 */

export interface QueuedItem {
  /** Identifiant de l'envoi (celui de la perte, ou de la série). */
  id: string;
  userId: string;
  kind: "une" | "serie";
  /** Saisies telles qu'envoyées au serveur (avec `clientId` et `enteredAt`). */
  payloads: unknown[];
  /** Résumé affiché (« 2 kg — Carottes »). */
  summary: string;
  enteredAt: string;
  status: "attente" | "refusee";
  error?: string;
  attempts: number;
}

export interface QueueStore {
  all(): Promise<QueuedItem[]>;
  put(item: QueuedItem): Promise<void>;
  remove(id: string): Promise<void>;
}

/** `retry` : échec passager du serveur, la perte reste en attente. */
export type SendResult = { ok: true } | { ok: false; error: string; authRequired?: boolean; retry?: boolean };

export interface FlushResult {
  sent: number;
  refused: number;
  /** Le réseau manque encore : il reste des pertes en attente. */
  offline: boolean;
  /** Session expirée : se reconnecter pour envoyer. */
  authRequired: boolean;
}

/** Échec d'un appel au serveur dû au réseau (et non à un refus du serveur). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = e instanceof Error ? e.message : String(e);
  return e instanceof TypeError || /fetch|network|réseau|load failed|connection/i.test(message);
}

/** Ajoute à une saisie son identifiant d'appareil et son heure de saisie (une seule fois : un renvoi garde les mêmes). */
export function stamp<T extends object>(payload: T, now = new Date()): T & { clientId: string; enteredAt: string } {
  const p = payload as T & { clientId?: string; enteredAt?: string };
  return { ...payload, clientId: p.clientId ?? crypto.randomUUID(), enteredAt: p.enteredAt ?? now.toISOString() };
}

/** Envoie les pertes en attente de ce compte, de la plus ancienne à la plus récente. */
export async function flushQueue(
  store: QueueStore,
  userId: string,
  send: (item: QueuedItem) => Promise<SendResult>,
): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, refused: 0, offline: false, authRequired: false };
  const items = (await store.all())
    .filter((i) => i.userId === userId && i.status === "attente")
    .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
  for (const item of items) {
    let r: SendResult;
    try {
      r = await send(item);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      result.offline = true;
      await store.put({ ...item, attempts: item.attempts + 1 });
      break;
    }
    if (r.ok) {
      await store.remove(item.id);
      result.sent++;
    } else if (r.authRequired) {
      result.authRequired = true;
      break;
    } else if (r.retry) {
      result.offline = true;
      break;
    } else {
      await store.put({ ...item, status: "refusee", error: r.error, attempts: item.attempts + 1 });
      result.refused++;
    }
  }
  return result;
}

/** File en mémoire (tests). */
export function memoryStore(initial: QueuedItem[] = []): QueueStore {
  const items = new Map(initial.map((i) => [i.id, i]));
  return {
    all: async () => [...items.values()],
    put: async (item) => void items.set(item.id, item),
    remove: async (id) => void items.delete(id),
  };
}

const DB_NAME = "pertes";
const STORE = "file-hors-ligne";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/** File gardée dans le navigateur (IndexedDB). */
export function indexedDbStore(): QueueStore {
  return {
    all: () => run("readonly", (s) => s.getAll() as IDBRequest<QueuedItem[]>),
    put: (item) => run("readwrite", (s) => s.put(item)).then(() => undefined),
    remove: (id) => run("readwrite", (s) => s.delete(id)).then(() => undefined),
  };
}
