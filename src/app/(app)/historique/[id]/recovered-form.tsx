"use client";

import { useActionState, useState } from "react";
import { recoveredAction, type RecoveredState } from "../actions";

interface SaleLine {
  destinationId: string;
  name: string;
  recoveredAmount: number | null;
}

/** Saisir ou compléter le montant encaissé des lignes de vente (Too Good To Go, vente flash…). */
export function RecoveredForm({ id, revision, lines }: { id: string; revision: number; lines: SaleLine[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RecoveredState, FormData>(recoveredAction, {});

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {lines.some((l) => l.recoveredAmount == null) ? "Saisir la recette encaissée" : "Modifier la recette encaissée"}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <p className="text-slate-700">Montant réellement encaissé, en euros (vide si pas encore connu).</p>
      {lines.map((l) => (
        <label key={l.destinationId} className="flex items-center justify-between gap-3">
          <span className="font-medium">{l.name}</span>
          <input
            name={`montant_${l.destinationId}`}
            inputMode="decimal"
            defaultValue={l.recoveredAmount ?? ""}
            className="field w-32 text-right"
            aria-label={`Montant encaissé pour ${l.name}`}
          />
        </label>
      ))}
      {state.error && (
        <p role="alert" className="text-red-800">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary flex-1">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className="px-4 text-slate-700" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
    </form>
  );
}
