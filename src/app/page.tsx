import {
  computeProductionWeek,
  formatProductionWeek,
  toProductionLocalDate,
} from "@/domain/semaine-production";

export const dynamic = "force-dynamic";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

export default function HomePage() {
  // Phase 0 : semaine théorique ; à partir de la Phase 1, lue dans le calendrier stocké en base.
  const week = computeProductionWeek(toProductionLocalDate(new Date()));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">Suivi des pertes</h1>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Semaine de production en cours</p>
        <p className="text-3xl font-semibold">{formatProductionWeek(week)}</p>
        <p className="text-slate-600">
          {formatDay(week.startDate)} → {formatDay(week.endDate)}
        </p>
      </section>
      <p className="text-sm text-slate-500">Application en cours de construction — Phase 0.</p>
    </main>
  );
}
