"use client";

import { useActionState } from "react";
import { Feedback } from "../feedback";
import { type CompleteCostsState, completeCostsAction } from "./actions";

export function CompleteButton({ ready }: { ready: number }) {
  const [state, action, pending] = useActionState<CompleteCostsState, FormData>(() => completeCostsAction(), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" className="btn-primary" disabled={pending || ready === 0}>
        {pending
          ? "Calcul en cours…"
          : ready
            ? `Compléter les coûts manquants (${ready})`
            : "Aucun coût à compléter pour l'instant"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
