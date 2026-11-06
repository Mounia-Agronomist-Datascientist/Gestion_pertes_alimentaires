import Link from "next/link";
import { db } from "@/db/client";
import { addDays, formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { listTeamsForWeek } from "@/modules/admin/teams";
import { requireUser } from "@/modules/auth/next-session";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { teamWeekAction } from "../actions";

export const metadata = { title: "Équipes par semaine — Administration" };

export default async function TeamsWeekPage({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const admin = await requireUser();
  const { semaine } = await searchParams;
  const current = await findStoredProductionWeek(db, toProductionLocalDate(new Date()));
  const next = current ? await findStoredProductionWeek(db, addDays(current.endDate, 1)) : null;
  const week = semaine === "suivante" ? next : current;
  if (!week) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const teams = await listTeamsForWeek(db, admin, week.id);

  const chip = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-teal-700 text-white" : "bg-white text-slate-700 shadow-sm"}`;

  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Équipes actives — {formatProductionWeek(week)}</h1>
      <nav className="flex gap-2">
        <Link className={chip(semaine !== "suivante")} href="/admin/equipes">
          Semaine en cours{current && ` (${formatProductionWeek(current)})`}
        </Link>
        <Link className={chip(semaine === "suivante")} href="/admin/equipes?semaine=suivante">
          Semaine suivante{next && ` (${formatProductionWeek(next)})`}
        </Link>
      </nav>
      <p className="text-sm text-slate-600">
        Une équipe désactivée n&apos;est plus proposée pour cette semaine. Elle n&apos;est jamais supprimée et son
        historique reste consultable.
      </p>
      <ul className="flex flex-col gap-2">
        {teams.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <span className="flex items-center gap-3">
              <span
                className="flex size-10 items-center justify-center rounded-full text-xl font-bold text-white"
                style={{ backgroundColor: t.colorHex }}
                aria-hidden
              >
                {t.letter}
              </span>
              <span>
                <span className="font-semibold">
                  Équipe {t.letter} – {t.colorName}
                </span>
                <span className={`block text-sm ${t.activeThisWeek ? "text-emerald-700" : "text-slate-500"}`}>
                  {t.activeThisWeek ? "Active" : `Inactive${t.note ? ` — ${t.note}` : ""}`}
                </span>
              </span>
            </span>
            <form action={teamWeekAction} className="flex items-center gap-2">
              <input type="hidden" name="teamId" value={t.id} />
              <input type="hidden" name="weekId" value={week.id} />
              <input type="hidden" name="active" value={t.activeThisWeek ? "0" : "1"} />
              {t.activeThisWeek && <input name="note" placeholder="Motif (facultatif)" className="field min-h-10 w-40 text-base" />}
              <button type="submit" className={t.activeThisWeek ? "font-medium text-red-800 underline" : "font-medium text-teal-800 underline"}>
                {t.activeThisWeek ? "Désactiver" : "Réactiver"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
