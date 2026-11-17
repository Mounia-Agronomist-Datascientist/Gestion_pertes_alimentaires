import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { canReadLossAlerts, listLossAlerts } from "@/modules/alertes/consultation";
import { loadAlertSettings } from "@/modules/alertes/reglages";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { markLossAlertSeenAction } from "../actions";
import { LossAlertCard } from "../loss-alert-card";

export const metadata = { title: "Alertes d'analyse — Pertes" };

const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export default async function LossAlertsPage({ searchParams }: { searchParams: Promise<{ toutes?: string }> }) {
  const user = await requireUser();
  if (!canReadLossAlerts(user)) redirect("/");
  const all = (await searchParams).toutes === "1";
  const [alerts, settings] = await Promise.all([listLossAlerts(db, user, { unseenOnly: !all }), loadAlertSettings(db)]);
  const unseen = all ? alerts.filter((a) => !a.seen).length : alerts.length;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Alertes d&apos;analyse</h1>
      <p className="text-slate-600">
        Calculées chaque nuit pour la semaine de production terminée.{" "}
        <strong>Perte inhabituelle</strong> : une équipe, une zone ou un plat perd au moins {pct.format(settings.unusualRate)} de plus que sa moyenne des 4
        semaines précédentes (à volume égal quand la production est connue), à partir de {num.format(settings.minKg)} kg.{" "}
        <strong>Cause récurrente</strong> : la même cause est la première cause de pertes d&apos;une équipe ou d&apos;un plat {settings.recurrenceWeeks}{" "}
        semaines de suite.
        {can(user, "referentiel.manage") && (
          <>
            {" "}
            <Link href="/admin/alertes" className="underline">
              Régler les seuils
            </Link>
          </>
        )}
      </p>
      <nav className="flex flex-wrap items-center gap-2">
        <Link href="/alertes/analyse" className={`rounded-full px-4 py-2 text-sm font-medium ${all ? "bg-white shadow-sm" : "bg-teal-700 text-white"}`}>
          À voir
        </Link>
        <Link href="/alertes/analyse?toutes=1" className={`rounded-full px-4 py-2 text-sm font-medium ${all ? "bg-teal-700 text-white" : "bg-white shadow-sm"}`}>
          Toutes
        </Link>
        {unseen > 1 && (
          <form action={markLossAlertSeenAction} className="sm:ml-auto">
            <button type="submit" className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow-sm">
              Tout marquer comme vu ({unseen})
            </button>
          </form>
        )}
      </nav>
      {alerts.length === 0 ? (
        <p className="text-slate-600">{all ? "Aucune alerte d'analyse pour l'instant." : "Aucune alerte à voir."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <LossAlertCard key={a.id} alert={a} />
          ))}
        </ul>
      )}
      <Link href="/alertes" className="text-center text-slate-700 underline">
        Alertes « saisie incomplète »
      </Link>
    </div>
  );
}
