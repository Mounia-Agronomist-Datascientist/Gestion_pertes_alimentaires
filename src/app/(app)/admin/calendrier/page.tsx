import Link from "next/link";
import { db } from "@/db/client";
import { addDays, formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { listWeekDays } from "@/modules/admin/production-days";
import { requireUser } from "@/modules/auth/next-session";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { fmtLongDay } from "../../alertes/format";
import { productionDayAction } from "../actions";

export const metadata = { title: "Calendrier de production — Administration" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const admin = await requireUser();
  const { jour } = await searchParams;
  const today = toProductionLocalDate(new Date());
  const week = await findStoredProductionWeek(db, jour && /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : today);
  if (!week) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const days = await listWeekDays(db, admin, week.id);
  const chip = "rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm";

  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Jours de production — {formatProductionWeek(week)}</h1>
      <nav className="flex flex-wrap gap-2">
        <Link className={chip} href={`/admin/calendrier?jour=${addDays(week.startDate, -7)}`}>
          ← Précédente
        </Link>
        <Link className={chip} href="/admin/calendrier">
          Semaine en cours
        </Link>
        <Link className={chip} href={`/admin/calendrier?jour=${addDays(week.startDate, 7)}`}>
          Suivante →
        </Link>
      </nav>
      <p className="text-sm text-slate-600">
        Par défaut, on produit le jeudi, le vendredi et du lundi au mercredi. Retirez un jour férié non travaillé ou
        ajoutez un samedi travaillé : les alertes « saisie incomplète » ne contrôlent que les jours de production.
      </p>
      <ul className="flex flex-col gap-2">
        {days.map((d) => (
          <li key={d.day} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <span>
              <span className="font-semibold first-letter:uppercase">{fmtLongDay(d.day)}</span>
              <span className={`block text-sm ${d.isProductionDay ? "text-emerald-700" : "text-slate-500"}`}>
                {d.isProductionDay ? "Jour de production" : "Non travaillé"}
                {d.isProductionDay !== d.isDefault && " (modifié)"}
                {d.note && ` — ${d.note}`}
              </span>
            </span>
            <form action={productionDayAction} className="flex items-center gap-2">
              <input type="hidden" name="day" value={d.day} />
              <input type="hidden" name="production" value={d.isProductionDay ? "0" : "1"} />
              <input name="note" placeholder={d.isProductionDay ? "Motif (ex. férié)" : "Motif (facultatif)"} className="field min-h-10 w-44 text-base" />
              <button type="submit" className={d.isProductionDay ? "font-medium text-red-800 underline" : "font-medium text-teal-800 underline"}>
                {d.isProductionDay ? "Retirer" : "Ajouter"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
