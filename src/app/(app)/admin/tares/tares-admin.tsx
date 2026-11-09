"use client";

import { useActionState, useState } from "react";
import { type TareActionState, tareAction } from "../actions";

interface Container {
  id: string;
  name: string;
  kind: "gastro" | "support";
  maxCount: number | null;
  active: boolean;
  currentTareKg: number | null;
  versions: { id: string; unitTareKg: number; validFrom: string; validTo: string | null; source: string | null; used: boolean }[];
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));
const fmtKg = (kg: number) => `${kg.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg`;

export function TaresAdmin({ containers, today }: { containers: Container[]; today: string }) {
  const [state, action, pending] = useActionState<TareActionState, FormData>(tareAction, {});
  const [editing, setEditing] = useState<string | null>(null);

  // Le message s'affiche dans la fiche en cours de modification, sinon en haut de la page.
  const feedback = (
    <>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
          {state.message}
        </p>
      )}
    </>
  );

  const section = (kind: Container["kind"], title: string) => (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {containers
          .filter((c) => c.kind === kind)
          .map((c) => (
            <li key={c.id} className={`flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ${c.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {c.name}
                  {!c.active && <span className="ml-2 rounded-full bg-slate-200 px-2 text-sm font-normal">Désactivé</span>}
                </span>
                <span className="text-lg font-bold">{c.currentTareKg != null ? fmtKg(c.currentTareKg) : "Pas de tare en vigueur"}</span>
              </div>
              {c.kind === "gastro" && <span className="text-sm text-slate-600">Maximum {c.maxCount ?? "—"} par pesée</span>}

              {editing === c.id ? (
                <div className="flex flex-col gap-3">
                  {feedback}
                  <form action={action} className="flex flex-col gap-2">
                    <input type="hidden" name="intent" value="tare" />
                    <input type="hidden" name="containerTypeId" value={c.id} />
                    <input type="hidden" name="name" value={c.name} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">Nouvelle tare (kg)</span>
                        <input name="unitTareKg" inputMode="decimal" required className="field" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">À partir du</span>
                        <input name="validFrom" type="date" required defaultValue={today} className="field" />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Motif (facultatif)</span>
                      <input name="note" className="field" placeholder="ex. nouveaux gastros, nouvelle pesée" />
                    </label>
                    <button type="submit" disabled={pending} className="btn-primary">
                      Enregistrer la tare
                    </button>
                  </form>
                  {c.kind === "gastro" && (
                    <form action={action} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="intent" value="max" />
                      <input type="hidden" name="containerTypeId" value={c.id} />
                      <input type="hidden" name="name" value={c.name} />
                      <label className="flex flex-1 flex-col gap-1">
                        <span className="font-medium">Nombre maximum par pesée</span>
                        <input name="maxCount" inputMode="numeric" defaultValue={c.maxCount ?? ""} className="field" />
                      </label>
                      <button type="submit" disabled={pending} className="btn-secondary">
                        Enregistrer
                      </button>
                    </form>
                  )}
                  <button type="button" className="self-start px-1 text-slate-700" onClick={() => setEditing(null)}>
                    Fermer
                  </button>
                </div>
              ) : (
                <form action={action} className="flex gap-4">
                  <input type="hidden" name="containerTypeId" value={c.id} />
                  <input type="hidden" name="name" value={c.name} />
                  <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(c.id)}>
                    Modifier
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value={c.active ? "deactivate" : "activate"}
                    className={`text-sm font-medium underline ${c.active ? "text-red-800" : "text-teal-800"}`}
                  >
                    {c.active ? "Désactiver" : "Réactiver"}
                  </button>
                </form>
              )}

              <details className="text-sm text-slate-600">
                <summary className="cursor-pointer">Historique des tares ({c.versions.length})</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {c.versions.map((v) => (
                    <li key={v.id}>
                      {fmtKg(v.unitTareKg)} — du {fmtDay(v.validFrom)}
                      {v.validTo && ` au ${fmtDay(v.validTo)}`}
                      {v.validFrom > today ? " (à venir)" : (v.validTo == null || v.validTo >= today) && " (en vigueur)"}
                      {v.source && ` · ${v.source}`}
                      {v.used && " · utilisée dans des pertes"}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
      </ul>
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {!editing && feedback}
      {section("gastro", "Gastros")}
      {section("support", "Échelles")}
    </div>
  );
}
