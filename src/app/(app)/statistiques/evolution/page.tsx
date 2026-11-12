import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { type Period, periodLabel } from "@/domain/periodes";
import { formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { annualEvolution, monthlyEvolution, weekComparison, type WeekPoint } from "@/modules/statistiques/evolution";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { BarTable, Card, detailOf, euro, FilterForm, num, OptionChips, type Params, PeriodNav, scopeNote, shortTrend, StatsTabs, statsContext } from "../shared";
import { ColumnChart } from "./column-chart";

export const metadata = { title: "Évolution — Statistiques — Pertes" };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

type Measure = "kg" | "volume";

export default async function EvolutionPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const base = await statsContext(user, params);
  // La comparaison part toujours d'une semaine : celle choisie, sinon la semaine en cours.
  let anchor: Extract<Period, { kind: "semaine" }> | null = base.period.kind === "semaine" ? base.period : null;
  if (!anchor) {
    const week = await findStoredProductionWeek(db, base.today);
    if (week) anchor = { kind: "semaine", year: week.year, number: week.number };
  }
  if (!anchor) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const ctx = { ...base, period: anchor as Period };
  const measure: Measure = params.mesure === "volume" ? "volume" : "kg";
  const keep = { mesure: measure };
  const path = "/statistiques/evolution";

  const comparison = await weekComparison(db, user, anchor, ctx.filters);
  if (!comparison) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const [weekRow] = await db.query.productionWeeks.findMany({ where: (w, { and, eq }) => and(eq(w.year, anchor.year), eq(w.number, anchor.number)), limit: 1 });
  const endMonth = { year: Number(weekRow!.endDate.slice(0, 4)), month: Number(weekRow!.endDate.slice(5, 7)) };
  const [months, years, previous, next] = await Promise.all([
    monthlyEvolution(db, user, endMonth, ctx.filters),
    annualEvolution(db, user, anchor.year, ctx.filters),
    adjacentOf(db, anchor, -1),
    adjacentOf(db, anchor, 1),
  ]);
  const { withCosts, current } = comparison;
  // Les mois d'avant la première perte enregistrée n'apportent rien : on commence au premier mois qui en a.
  const firstMonth = months.findIndex((m) => m.summary.events > 0);
  const shownMonths = firstMonth < 0 ? months.slice(-1) : months.slice(firstMonth);
  const note = scopeNote(user, ctx.compareTeams);
  const volumeLabel = comparison.volumeTeam ? "barquettes prévues pour l'équipe" : "barquettes prévues (toutes équipes)";

  const rows: { label: string; point: Pick<WeekPoint, "perThousand"> & { foodKg: number | null; barquettes: number | null; events: number | null; grossEur: number | null; planned: number | null } }[] = [
    { label: `${formatProductionWeek(current)} (choisie)`, point: flat(current) },
    ...(comparison.previous ? [{ label: `${formatProductionWeek(comparison.previous)} (précédente)`, point: flat(comparison.previous) }] : []),
    ...(comparison.average
      ? [
          {
            label: `Moyenne des ${comparison.average.weeks} semaines d'avant`,
            point: { ...comparison.average, planned: null },
          },
        ]
      : []),
    ...(comparison.lastYear ? [{ label: `${formatProductionWeek(comparison.lastYear)} (un an avant)`, point: flat(comparison.lastYear) }] : []),
  ];
  const cell = "py-2 pl-3 text-right tabular-nums whitespace-nowrap";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Évolution — {periodLabel(anchor)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="evolution" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} extra={keep} />
      <FilterForm path={path} ctx={ctx} keep={keep} />

      <Card title="Comparaison de la semaine">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 font-medium" />
                <th className="py-1 pl-3 text-right font-medium">Kg</th>
                <th className="py-1 pl-3 text-right font-medium">Kg / 1 000 barq.</th>
                <th className="py-1 pl-3 text-right font-medium">Barq. perdues</th>
                <th className="py-1 pl-3 text-right font-medium">Pertes</th>
                {withCosts && <th className="py-1 pl-3 text-right font-medium">Coût brut</th>}
                <th className="py-1 pl-3 text-right font-medium">Barq. prévues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={`border-t border-slate-100 ${i === 0 ? "font-semibold" : ""}`}>
                  <td className="py-2">{r.label}</td>
                  <td className={cell}>{r.point.foodKg != null ? num.format(r.point.foodKg) : "—"}</td>
                  <td className={cell}>{r.point.perThousand != null ? num.format(r.point.perThousand) : "—"}</td>
                  <td className={cell}>{r.point.barquettes != null ? num.format(r.point.barquettes) : "—"}</td>
                  <td className={cell}>{r.point.events != null ? num.format(r.point.events) : "—"}</td>
                  {withCosts && <td className={cell}>{r.point.grossEur != null ? euro.format(r.point.grossEur) : "—"}</td>}
                  <td className={`${cell} text-slate-600`}>{r.point.planned != null ? num.format(r.point.planned) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          « Kg / 1 000 barq. » : kg de pertes alimentaires pour 1 000 {volumeLabel} au plan de production importé. Il permet de comparer des semaines
          de volumes différents ; sans plan importé, il n&apos;est pas calculé. Les barquettes réellement produites seront ajoutées avec les ratios
          (étape 4.6). La moyenne à volume égal ne compte que les semaines qui ont un plan importé.
          {!comparison.lastYear && " Pas de pertes enregistrées la même semaine l'année précédente."}
        </p>
      </Card>

      <Card title="Dernières semaines">
        <OptionChips
          label="Afficher"
          path={path}
          ctx={ctx}
          name="mesure"
          value={measure}
          keep={keep}
          options={[
            { value: "kg", label: "En kg" },
            { value: "volume", label: "À volume égal" },
          ]}
        />
        <ColumnChart
          caption={measure === "kg" ? "Kg de pertes alimentaires par semaine" : "Kg de pertes pour 1 000 barquettes prévues, par semaine"}
          columns={comparison.series.map((p) => {
            const value = measure === "kg" ? p.summary.foodKg : p.perThousand;
            return {
              key: p.id,
              label: `S${String(p.number).padStart(2, "0")}`,
              value,
              text: value == null ? "—" : measure === "kg" ? `${num.format(value)} kg` : `${num.format(value)} kg`,
              highlight: p.id === current.id,
            };
          })}
        />
        <p className="text-xs text-slate-500">
          {measure === "kg" ? "Kg de pertes alimentaires de chaque semaine de production." : `Kg de pertes pour 1 000 ${volumeLabel} ; un tiret : pas de plan importé.`}
        </p>
      </Card>

      <Card title="Évolution mensuelle">
        <BarTable
          caption="Kg par mois"
          showShare={false}
          rows={shownMonths.map((m, i) => ({
            key: `${m.year}-${m.month}`,
            label: `${MONTHS[m.month - 1]} ${m.year}`,
            value: m.summary.foodKg,
            text: `${num.format(m.summary.foodKg)} kg`,
            detail: `${detailOf(m.summary)}${i > 0 ? ` · ${shortTrend(m.summary.foodKg, shownMonths[i - 1]!.summary.foodKg)}` : ""}`,
          }))}
        />
        <p className="text-xs text-slate-500">Mois de la date réelle de la perte (12 mois au plus, à partir de la première perte enregistrée) ; comparaison en kg avec le mois
          d&apos;avant.</p>
      </Card>

      <Card title="Évolution annuelle">
        {years.length === 0 ? (
          <p className="text-slate-600">Aucune perte enregistrée.</p>
        ) : (
          <BarTable
            caption="Kg par année de production"
            showShare={false}
            rows={years.map((y, i) => ({
              key: String(y.year),
              label: String(y.year),
              value: y.summary.foodKg,
              text: `${num.format(y.summary.foodKg)} kg`,
              detail: `${detailOf(y.summary)}${i > 0 ? ` · ${shortTrend(y.summary.foodKg, years[i - 1]!.summary.foodKg)}` : ""}`,
            }))}
          />
        )}
        <p className="text-xs text-slate-500">Années de production (semaines S01 à S52/S53). L&apos;année en cours n&apos;est pas complète.</p>
      </Card>
    </div>
  );
}

function flat(p: WeekPoint) {
  return {
    foodKg: p.summary.foodKg,
    barquettes: p.summary.barquettes,
    events: p.summary.events,
    grossEur: p.summary.cost?.grossEur ?? null,
    perThousand: p.perThousand,
    planned: p.planned?.barquettes ?? null,
  };
}
