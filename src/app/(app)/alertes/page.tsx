import Link from "next/link";
import { db } from "@/db/client";
import { ESTIMATED_LOSS_KG_PER_WINDOW } from "@/domain/plages-reutilisation";
import { listAlerts } from "@/modules/alertes/service";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { CancelAlertForm } from "./cancel-alert-form";
import { alertTitle, fmtLongDay, missingDaysLabel } from "./format";

export const metadata = { title: "Alertes — Pertes" };

const STATUS = {
  active: { label: "Estimation comptée", style: "bg-red-50 text-red-800" },
  regularisee: { label: "Régularisée", style: "bg-emerald-50 text-emerald-800" },
  annulee: { label: "Levée", style: "bg-slate-100 text-slate-700" },
} as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ toutes?: string }> }) {
  const user = await requireUser();
  const all = (await searchParams).toutes === "1";
  const alerts = await listAlerts(db, user, { onlyActive: !all });
  const activeKg = alerts.filter((a) => a.status === "active").reduce((sum, a) => sum + a.estimatedKg, 0);
  const canResolve = can(user, "alerts.resolve");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Alertes « saisie incomplète »</h1>
      <p className="text-slate-600">
        Chaque jour de production doit avoir au moins une déclaration. Si un jour d&apos;une plage (jeudi-vendredi ou
        lundi-mercredi) n&apos;est pas renseigné, l&apos;équipe reçoit une perte estimée de {ESTIMATED_LOSS_KG_PER_WINDOW} kg
        pour cette plage, toujours comptée à part des pertes déclarées.
      </p>
      <nav className="flex gap-2">
        <Link href="/alertes" className={`rounded-full px-4 py-2 text-sm font-medium ${all ? "bg-white shadow-sm" : "bg-teal-700 text-white"}`}>
          En cours
        </Link>
        <Link href="/alertes?toutes=1" className={`rounded-full px-4 py-2 text-sm font-medium ${all ? "bg-teal-700 text-white" : "bg-white shadow-sm"}`}>
          Historique
        </Link>
      </nav>
      {!all && alerts.length > 0 && (
        <p className="rounded-xl bg-red-50 p-3 font-medium text-red-900">
          {alerts.length} alerte{alerts.length > 1 ? "s" : ""} en cours — {activeKg} kg estimés
        </p>
      )}
      {alerts.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600">Aucune alerte.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="flex size-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: a.teamColorHex }} aria-hidden>
                    {a.teamLetter}
                  </span>
                  Équipe {a.teamLetter} – {a.teamColorName}
                </span>
                <span className={`rounded-full px-2 text-sm ${STATUS[a.status].style}`}>{STATUS[a.status].label}</span>
              </span>
              <span>{alertTitle(a)}</span>
              <span className="text-sm text-slate-600">
                Du {fmtLongDay(a.firstDay)} au {fmtLongDay(a.lastDay)} — {a.estimatedKg} kg estimés
              </span>
              {a.status === "active" && a.missingDays.length > 0 && (
                <span className="text-sm font-medium text-red-800">{missingDaysLabel(a.missingDays)}</span>
              )}
              {a.resolutionNote && <span className="text-sm text-slate-500">{a.resolutionNote}</span>}
              {canResolve && a.status === "active" && <CancelAlertForm alertId={a.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
