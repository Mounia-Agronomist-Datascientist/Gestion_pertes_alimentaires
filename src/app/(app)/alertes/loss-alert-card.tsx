import type { LossAlertView } from "@/modules/alertes/consultation";
import { markLossAlertSeenAction } from "./actions";
import { lossAlertContext, lossAlertSummary, lossAlertTitle } from "./analyse-format";

/** Alerte d'analyse : titre, phrase principale, contexte et bouton « Vu » tant qu'elle n'est pas vue par ce compte. */
export function LossAlertCard({ alert }: { alert: LossAlertView }) {
  const context = lossAlertContext(alert);
  return (
    <li className={`flex flex-col gap-1 rounded-2xl border-2 p-4 ${alert.seen ? "border-transparent bg-white shadow-sm" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
      <p className="font-semibold">
        <span aria-hidden>{alert.kind === "perte_inhabituelle" ? "▲ " : "↻ "}</span>
        {lossAlertTitle(alert)}
      </p>
      <p>{lossAlertSummary(alert)}</p>
      {context && <p className="text-sm opacity-80">{context}</p>}
      {alert.seen ? (
        <p className="text-sm text-slate-500">Vue</p>
      ) : (
        <form action={markLossAlertSeenAction}>
          <input type="hidden" name="alertId" value={alert.id} />
          <button type="submit" className="mt-1 rounded-xl bg-white px-4 py-2 text-sm font-medium text-amber-950 shadow-sm">
            Vu
          </button>
        </form>
      )}
    </li>
  );
}
