"use client";

import { useActionState, useState } from "react";
import { cancelAction, type CancelState } from "../actions";

export function CancelForm({ id, revision }: { id: string; revision: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelAction, {});

  if (!open) {
    return (
      <button type="button" className="min-h-14 rounded-xl border-2 border-red-700 px-4 text-lg font-semibold text-red-800" onClick={() => setOpen(true)}>
        Annuler cette déclaration
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl bg-red-50 p-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <p className="text-red-900">
        La déclaration restera consultable dans l&apos;historique mais ne comptera plus dans les statistiques.
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Motif de l&apos;annulation (obligatoire)</span>
        <input name="reason" required minLength={3} className="field" placeholder="ex. doublon" />
      </label>
      {state.error && (
        <p role="alert" className="text-red-800">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-12 flex-1 rounded-xl bg-red-700 px-4 font-semibold text-white">
          {pending ? "Annulation…" : "Confirmer l'annulation"}
        </button>
        <button type="button" className="min-h-12 rounded-xl px-4 font-medium text-slate-700" onClick={() => setOpen(false)}>
          Retour
        </button>
      </div>
    </form>
  );
}
