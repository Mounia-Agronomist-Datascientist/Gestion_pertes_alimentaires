import Link from "next/link";
import { db } from "@/db/client";
import { formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { countPendingProposals } from "@/modules/admin/causes";
import { alertsStartDateFromEnv, evaluateMissingDeclarations, listAlerts } from "@/modules/alertes/service";
import { alertTitle, fmtLongDay, missingDaysLabel, regularizationDeadline } from "./alertes/format";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const week = await findStoredProductionWeek(db, toProductionLocalDate(new Date()));
  const pendingCauses = can(user, "cause.review") ? await countPendingProposals(db) : 0;
  // Évaluation légère à chaque affichage ; en production, une tâche quotidienne fait de même (npm run alertes:evaluer).
  await evaluateMissingDeclarations(db, { startDate: alertsStartDateFromEnv() });
  const activeAlerts = await listAlerts(db, user, { onlyActive: true });
  const alertKg = activeAlerts.reduce((sum, a) => sum + a.estimatedKg, 0);

  return (
    <div className="flex flex-col gap-6">
      {params["mot-de-passe"] === "ok" && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
          Mot de passe modifié.
        </p>
      )}

      {activeAlerts.length > 0 &&
        (user.teamId ? (
          activeAlerts.map((a) => (
            <div key={a.id} role="alert" className="flex flex-col gap-1 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
              <p className="font-semibold">{alertTitle(a)}</p>
              <p>{a.estimatedKg} kg de pertes estimées sont attribués à votre équipe.</p>
              {a.missingDays.length > 0 && <p className="font-medium">{missingDaysLabel(a.missingDays)}</p>}
              {regularizationDeadline(a) >= toProductionLocalDate(new Date()) && (
                <p className="text-sm">
                  Renseignez {a.missingDays.length > 1 ? "ces jours" : "ce jour"} au plus tard le{" "}
                  {fmtLongDay(regularizationDeadline(a))} : l&apos;estimation sera alors retirée.
                </p>
              )}
            </div>
          ))
        ) : (
          <Link href="/alertes" role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 font-semibold text-red-900">
            {activeAlerts.length} alerte{activeAlerts.length > 1 ? "s" : ""} « saisie incomplète » — {alertKg} kg estimés →
          </Link>
        ))}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Semaine de production en cours</p>
        {week ? (
          <>
            <p className="text-3xl font-semibold">{formatProductionWeek(week)}</p>
            <p className="text-slate-600">
              {formatDay(week.startDate)} → {formatDay(week.endDate)}
            </p>
          </>
        ) : (
          <p className="text-red-700">Aucune semaine paramétrée pour aujourd&apos;hui : prévenez l&apos;administrateur.</p>
        )}
      </section>

      {can(user, "declaration.create") && (
        <section className="grid gap-3 sm:grid-cols-2">
          <Link href="/declarer" className="btn-tile">
            Déclarer une perte
            <span className="text-sm font-normal">Au fil de l&apos;eau, une perte à la fois</span>
          </Link>
          <Link href="/declarer/serie" className="btn-tile">
            Déclarer plusieurs pertes
            <span className="text-sm font-normal">En fin de service, tout d&apos;un coup</span>
          </Link>
        </section>
      )}

      <Link href="/historique" className="btn-secondary flex items-center justify-center">
        Pertes déclarées et corrections
      </Link>
      <Link href="/alertes" className="text-center text-slate-700 underline">
        Alertes « saisie incomplète »
      </Link>

      {(can(user, "user.manage") || can(user, "referentiel.manage")) && (
        <Link href="/admin" className="btn-secondary flex items-center justify-center gap-2">
          Administration
          {pendingCauses > 0 && (
            <span className="rounded-full bg-amber-500 px-2 text-sm text-white">
              {pendingCauses} cause{pendingCauses > 1 ? "s" : ""} à valider
            </span>
          )}
        </Link>
      )}

      {can(user, "indicators.read") && (
        <Link href="/couts" className="btn-secondary flex items-center justify-center">
          Coûts des pertes
        </Link>
      )}
      {can(user, "audit.read") && (
        <Link href="/journal" className="text-center text-slate-700 underline">
          Journal d&apos;audit
        </Link>
      )}
      <Link href="/mot-de-passe" className="text-slate-600 underline">
        Changer le mot de passe
      </Link>
    </div>
  );
}
