"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushQueue, indexedDbStore, type QueuedItem, type QueueStore } from "@/modules/declarations/offline-queue";
import { sendQueued } from "./declarer/actions";

/** Délai entre deux essais d'envoi tant que des pertes attendent. */
const RETRY_MS = 20_000;

interface OfflineState {
  /** Pas de réseau (appareil hors ligne, ou dernier envoi échoué faute de réseau). */
  offline: boolean;
  pending: number;
  refused: number;
  authRequired: boolean;
  /** Garde une perte ou une série sur l'appareil ; elle part dès que possible. */
  enqueue(item: Omit<QueuedItem, "userId" | "status" | "attempts">): Promise<void>;
  flush(): Promise<void>;
  /** Pertes gardées pour ce compte (page « en attente »). */
  items: QueuedItem[];
  remove(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  /** Signale un défaut de réseau constaté par un écran. */
  markOffline(): void;
}

const OfflineContext = createContext<OfflineState | null>(null);

export function useOfflineQueue(): OfflineState {
  const value = useContext(OfflineContext);
  if (!value) throw new Error("OfflineProvider manquant");
  return value;
}

/**
 * Saisie hors ligne (docs/PHASE6.md, étape 6.5) : file d'attente de l'appareil pour ce compte, envoi automatique au
 * retour du réseau (événement « online », retour sur l'application, essai toutes les 20 secondes), bandeau d'état.
 */
export function OfflineProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const store = useRef<QueueStore | null>(null);
  const flushing = useRef(false);
  const [items, setItems] = useState<QueuedItem[]>([]);
  const [offline, setOffline] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  const storeOf = () => (store.current ??= indexedDbStore());
  const refresh = useCallback(async () => {
    try {
      setItems((await storeOf().all()).filter((i) => i.userId === userId));
    } catch {
      setItems([]);
    }
  }, [userId]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const r = await flushQueue(storeOf(), userId, (item) => sendQueued(item.kind, item.payloads));
      setOffline(r.offline || !navigator.onLine);
      setAuthRequired(r.authRequired);
    } catch {
      // IndexedDB indisponible ou erreur inattendue : nouvel essai plus tard.
    } finally {
      flushing.current = false;
      await refresh();
    }
  }, [userId, refresh]);

  useEffect(() => {
    // État du réseau, connu seulement dans le navigateur : lu après l'hydratation, puis suivi par les événements.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffline(!navigator.onLine);
    void flush();
    const goOnline = () => {
      setOffline(false);
      void flush();
    };
    const goOffline = () => setOffline(true);
    const visible = () => document.visibilityState === "visible" && void flush();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [flush]);

  const pending = items.filter((i) => i.status === "attente").length;
  const refused = items.filter((i) => i.status === "refusee").length;

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void flush(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [pending, flush]);

  const value = useMemo<OfflineState>(
    () => ({
      offline,
      pending,
      refused,
      authRequired,
      items,
      flush,
      markOffline: () => setOffline(true),
      enqueue: async (item) => {
        await storeOf().put({ ...item, userId, status: "attente", attempts: 0 });
        await refresh();
      },
      remove: async (id) => {
        await storeOf().remove(id);
        await refresh();
      },
      retry: async (id) => {
        const item = items.find((i) => i.id === id);
        if (item) await storeOf().put({ ...item, status: "attente", error: undefined });
        await flush();
      },
    }),
    [offline, pending, refused, authRequired, items, flush, refresh, userId],
  );

  return (
    <OfflineContext.Provider value={value}>
      <OfflineBanner />
      {children}
    </OfflineContext.Provider>
  );
}

function OfflineBanner() {
  const { offline, pending, refused, authRequired, flush } = useOfflineQueue();
  if (!offline && !pending && !refused && !authRequired) return null;
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-1 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-amber-950 print:hidden"
    >
      {offline && (
        <p className="font-semibold">
          Hors ligne : les pertes validées sont gardées sur cet appareil et envoyées au retour du réseau.
        </p>
      )}
      {pending > 0 && (
        <p className="flex flex-wrap items-center gap-2">
          {plural(pending, "envoi")} en attente sur cet appareil.
          {!offline && (
            <button type="button" onClick={() => void flush()} className="font-medium underline">
              Envoyer maintenant
            </button>
          )}
        </p>
      )}
      {authRequired && (
        <p>
          Session expirée :{" "}
          <Link href="/connexion" className="font-medium underline">
            reconnectez-vous
          </Link>{" "}
          pour envoyer les pertes gardées (rien n&apos;est perdu).
        </p>
      )}
      {refused > 0 && (
        <Link href="/declarer/en-attente" className="font-medium text-red-800 underline">
          {plural(refused, "envoi")} refusé{refused > 1 ? "s" : ""} par le serveur : à voir →
        </Link>
      )}
      {(pending > 0 || refused > 0) && refused === 0 && (
        <Link href="/declarer/en-attente" className="text-sm underline">
          Voir les pertes en attente
        </Link>
      )}
    </div>
  );
}
