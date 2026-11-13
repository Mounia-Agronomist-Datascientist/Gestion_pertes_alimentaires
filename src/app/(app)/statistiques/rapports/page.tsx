import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { type Period, periodLabel, periodParams } from "@/domain/periodes";
import { addDays, formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { anchorWeek } from "@/modules/statistiques/context";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { Card, FilterForm, type Params, PeriodNav, scopeNote, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Rapports PDF — Statistiques — Pertes" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const ctx = await statsContext(user, params);
  const [anchor, previous, next] = await Promise.all([anchorWeek(db, ctx), adjacentOf(db, ctx.period, -1), adjacentOf(db, ctx.period, 1)]);
  const path = "/statistiques/rapports";
  const note = scopeNote(user, ctx.compareTeams);

  // Mois et année proposés : ceux de la période choisie (pour une semaine, le mois de son lundi).
  let month: Extract<Period, { kind: "mois" }>;
  if (ctx.period.kind === "mois") month = ctx.period;
  else {
    let date = ctx.period.kind === "periode" ? ctx.period.to : ctx.today;
    if (ctx.period.kind === "semaine") {
      const [week] = await db
        .select({ startDate: s.productionWeeks.startDate })
        .from(s.productionWeeks)
        .where(and(eq(s.productionWeeks.year, ctx.period.year), eq(s.productionWeeks.number, ctx.period.number)));
      if (week) date = addDays(week.startDate, 4);
    }
    month = ctx.period.kind === "annee" ? { kind: "mois", year: ctx.period.year, month: 12 } : { kind: "mois", year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
  }
  const year: Extract<Period, { kind: "annee" }> = { kind: "annee", year: ctx.period.kind === "periode" ? Number(ctx.period.to.slice(0, 4)) : ctx.period.year };
  const href = (type: string, period: Period) => `/statistiques/rapport?${new URLSearchParams({ ...periodParams(period), ...ctx.filterParams, type })}`;
  const reports = [
    { type: "hebdomadaire", title: "Rapport hebdomadaire", period: anchor, text: "Montants, zones, causes et produits de la semaine, points d'amélioration, 12 dernières semaines." },
    { type: "mensuel", title: "Rapport mensuel", period: month, text: "Synthèse du mois, devenir des pertes, zones, équipes, causes, produits, 12 derniers mois." },
    { type: "annuel", title: "Rapport annuel", period: year, text: "Synthèse de l'année, zones, équipes, causes, produits, mois par mois." },
    { type: "valorisation", title: "Rapport de valorisation", period: ctx.period, text: "Avec recette, sans recette, à part : kg, coût des produits, recettes, 12 semaines." },
    {
      type: "environnemental",
      title: "Rapport environnemental",
      period: ctx.period,
      text: `CO2e mesuré, estimé ou non couvert, par catégorie, devenir et produit${ctx.compareTeams ? ", et rapprochement avec Les Alchimistes" : ""}.`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Rapports PDF — {periodLabel(ctx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="rapports" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} />
      <FilterForm path={path} ctx={ctx} />
      <p className="text-sm text-slate-600">
        Chaque rapport reprend les chiffres des onglets, avec les mêmes filtres{ctx.compareTeams ? "" : " et votre périmètre"}. Choisissez la période
        ci-dessus : le rapport mensuel prend son mois, le rapport annuel son année.
      </p>
      {reports.map((r) => (
        <Card key={r.type} title={r.title}>
          <p className="text-sm text-slate-600">{r.text}</p>
          {r.period ? (
            <a className="btn-secondary flex items-center justify-center" href={href(r.type, r.period)}>
              Télécharger le PDF — {r.period.kind === "semaine" ? formatProductionWeek(r.period) : periodLabel(r.period)}
            </a>
          ) : (
            <p className="text-sm text-red-800">Semaine absente du calendrier.</p>
          )}
        </Card>
      ))}
    </div>
  );
}
