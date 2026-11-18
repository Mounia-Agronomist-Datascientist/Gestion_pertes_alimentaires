"use client";

import Link from "next/link";
import { useOfflineQueue } from "../../offline-provider";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Pertes gardées sur cet appareil (docs/PHASE6.md, étape 6.5) : en attente d'envoi, ou refusées par le serveur avec
 * leur motif. Une perte refusée se renvoie (après un réglage de l'administration, par exemple) ou se supprime pour
 * être saisie à nouveau.
 */
export function PendingList() {
  const { items, offline, flush, remove, retry } = useOfflineQueue();
  const sorted = [...items].sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Pertes en attente sur cet appareil</h1>
      <p className="text-slate-600">
        Pertes validées sans réseau. Elles partent toutes seules au retour du réseau et n&apos;apparaissent dans
        l&apos;historique et les statistiques qu&apos;une fois reçues. Elles ne sont visibles que sur cet appareil.
      </p>
      {sorted.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600">Aucune perte en attente.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((item) => (
            <li
              key={item.id}
              className={`flex flex-col gap-1 rounded-2xl p-4 shadow-sm ${item.status === "refusee" ? "border-2 border-red-300 bg-red-50 text-red-950" : "bg-white"}`}
            >
              <span className="font-semibold">{item.summary}</span>
              <span className="text-sm text-slate-600">
                Saisie le {dateTime.format(new Date(item.enteredAt))}
                {item.kind === "serie" && ` · série de ${item.payloads.length} pertes`}
              </span>
              {item.status === "attente" ? (
                <span className="text-sm">
                  En attente d&apos;envoi
                  {item.attempts ? ` (${item.attempts} essai${item.attempts > 1 ? "s" : ""})` : ""}.
                </span>
              ) : (
                <>
                  <span className="text-sm font-medium">Refusée par le serveur : {item.error}</span>
                  <span className="flex flex-wrap gap-4">
                    <button type="button" className="text-sm font-medium underline" onClick={() => void retry(item.id)}>
                      Renvoyer
                    </button>
                    <button
                      type="button"
                      className="text-sm font-medium underline"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Supprimer cette perte de l'appareil ? Elle ne sera pas enregistrée : saisissez-la à nouveau si besoin.",
                          )
                        )
                          void remove(item.id);
                      }}
                    >
                      Supprimer
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {sorted.some((i) => i.status === "attente") && !offline && (
        <button type="button" className="btn-secondary" onClick={() => void flush()}>
          Envoyer maintenant
        </button>
      )}
      <Link href="/declarer" className="btn-primary flex items-center justify-center">
        Déclarer une perte
      </Link>
    </div>
  );
}
