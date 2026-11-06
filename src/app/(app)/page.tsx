import Link from "next/link";
import { db } from "@/db/client";
import { formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const week = await findStoredProductionWeek(db, toProductionLocalDate(new Date()));

  return (
    <div className="flex flex-col gap-6">
      {params["mot-de-passe"] === "ok" && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
          Mot de passe modifié.
        </p>
      )}

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

      {(can(user, "user.manage") || can(user, "referentiel.manage")) && (
        <Link href="/admin" className="btn-secondary flex items-center justify-center">
          Administration
        </Link>
      )}

      <Link href="/mot-de-passe" className="text-slate-600 underline">
        Changer le mot de passe
      </Link>
    </div>
  );
}
