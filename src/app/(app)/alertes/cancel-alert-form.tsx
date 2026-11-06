"use client";

import { useActionState, useState } from "react";
import { type AlertActionState, cancelAlertAction } from "./actions";

export function CancelAlertForm({ alertId }: { alertId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AlertActionState, FormData>(cancelAlertAction, {});
  if (state.message) return <p className="text-sm text-emerald-800">{state.message}</p>;
  if (!open) {
    return (
      <button type="button" className="self-start text-sm font-medium text-teal-800 underline" onClick={() => setOpen(true)}>
        Lever l&apos;alerte
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="alertId" value={alertId} />
      <input name="note" required minLength={3} placeholder="Motif (ex. équipe en formation)" className="field min-h-10 flex-1 text-base" />
      <button type="submit" disabled={pending} className="font-medium text-red-800 underline">
        Confirmer
      </button>
      {state.error && <span className="w-full text-sm text-red-800">{state.error}</span>}
    </form>
  );
}
