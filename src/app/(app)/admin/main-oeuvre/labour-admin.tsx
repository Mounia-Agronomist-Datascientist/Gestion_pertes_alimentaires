"use client";

import { useActionState, useState } from "react";
import { type PlaceActionState, labourAction } from "../actions";
import { Feedback } from "../feedback";

interface Zone {
  id: string;
  name: string;
  current: { hourlyCostEur: number; unit: string } | null;
  versions: { id: string; hourlyCostEur: number; unit: string; validFrom: string; validTo: string | null; source: string | null }[];
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));
const fmtEur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export function LabourAdmin({ zones, today }: { zones: Zone[]; today: string }) {
  const [state, action, pending] = useActionState<PlaceActionState, FormData>(labourAction, {});
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {!editing && <Feedback state={state} />}
      <ul className="flex flex-col gap-2">
        {zones.map((z) => (
          <li key={z.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{z.name}</span>
              <span className="text-lg font-bold">{z.current ? `${fmtEur(z.current.hourlyCostEur)} / ${z.current.unit}` : "Non renseigné"}</span>
            </div>
            {editing === z.id ? (
              <form action={action} className="flex flex-col gap-2">
                <Feedback state={state} />
                <input type="hidden" name="zoneId" value={z.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">Coût horaire moyen (€)</span>
                    <input name="hourlyCostEur" inputMode="decimal" required className="field" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">À partir du</span>
                    <input name="validFrom" type="date" required defaultValue={today} className="field" />
                  </label>
                </div>
                <input name="note" className="field" placeholder="Source ou motif (facultatif)" aria-label="Source ou motif" />
                <div className="flex gap-2">
                  <button type="submit" disabled={pending} className="btn-primary flex-1">
                    Enregistrer
                  </button>
                  <button type="button" className="px-4 text-slate-700" onClick={() => setEditing(null)}>
                    Fermer
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="self-start text-sm font-medium text-teal-800 underline" onClick={() => setEditing(z.id)}>
                {z.current ? "Nouveau coût horaire" : "Saisir le coût horaire"}
              </button>
            )}
            {z.versions.length > 0 && (
              <details className="text-sm text-slate-600">
                <summary className="cursor-pointer">Historique ({z.versions.length})</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {z.versions.map((v) => (
                    <li key={v.id}>
                      {fmtEur(v.hourlyCostEur)} / {v.unit} — du {fmtDay(v.validFrom)}
                      {v.validTo && ` au ${fmtDay(v.validTo)}`}
                      {v.validFrom > today ? " (à venir)" : (v.validTo == null || v.validTo >= today) && " (en vigueur)"}
                      {v.source && ` · ${v.source}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
