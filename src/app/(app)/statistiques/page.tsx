import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import { requireUser } from "@/modules/auth/next-session";
import { generalDashboard } from "@/modules/statistiques/dashboard";
import { canReadStats } from "@/modules/statistiques/facts";
import { Card, DestinationBars, FilterForm, type Params, PeriodNav, scopeNote, StatsTabs, statsContext, SummaryNotes, SummaryTiles } from "./shared";

export const metadata = { title: "Statistiques — Pertes" };

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const ctx = await statsContext(user, await searchParams);
  const dashboard = await generalDashboard(db, user, ctx.period, ctx.filters);
  const note = scopeNote(user, ctx.compareTeams);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Statistiques — {periodLabel(ctx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="general" />
      <PeriodNav path="/statistiques" ctx={ctx} previous={dashboard.previousPeriod} next={dashboard.nextPeriod} />
      <FilterForm path="/statistiques" ctx={ctx} />

      <SummaryTiles
        current={dashboard.current}
        previous={dashboard.previous}
        previousLabel={dashboard.previousPeriod ? periodLabel(dashboard.previousPeriod) : null}
        withCosts={dashboard.withCosts}
      />
      <SummaryNotes summary={dashboard.current} withCosts={dashboard.withCosts} />

      <Card title="Devenir des pertes alimentaires">
        <DestinationBars summary={dashboard.current} />
      </Card>

      <p className="text-sm text-slate-500">
        Pourcentages de pertes par rapport à la production prévue et réelle : onglet « Ratios ».
      </p>
    </div>
  );
}
