import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { type Period, periodLabel } from "@/domain/periodes";
import { formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { annualEvolution, monthlyEvolution, weekComparison, type WeekPoint } from "@/modules/statistiques/evolution";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { BarTable, Card, detailOf, euro, ExportLinks, FilterForm, num, OptionChips, type Params, PeriodNav, scopeNote, shortTrend, StatsTabs, statsContext } from "../shared";
import { COST_COMPONENTS } from "@/modules/couts/summary";
import { COMPONENT_COLORS } from "../../couts/colors";
import { ColumnChart } from "./column-chart";
import { StackedColumnChart } from "./stacked-chart";

export const metadata = { title: "Évolution — Statistiques — Pertes" };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

type Measure = "kg" | "volume" | "reel";

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
  const measure: Measure = params.mesure === "volume" || params.mesure === "reel" ? params.mesure : "kg";
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
  const scopeLabel = comparison.volumeTeam ? "de l'équipe" : "(toutes équipes)";

  const rows: {
    label: string;
    point: Pick<WeekPoint, "perThousand" | "perThousandActual"> & { foodKg: number | null; barquettes: number | null; events: number | null; grossEur: number | null; planned: number | null; actual: number | null };
  }[] = [
    { label: `${formatProductionWeek(current)} (choisie)`, point: flat(current) },
    ...(comparison.previous ? [{ label: `${formatProductionWeek(comparison.previous)} (précédente)`, point: flat(comparison.previous) }] : []),
    ...(comparison.average
      ? [
          {
            label: `Moyenne des ${comparison.average.weeks} semaines d'avant`,
            point: { ...comparison.average, planned: null, actual: null },
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
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 font-medium" />
                <th className="py-1 pl-3 text-right font-medium">Kg</th>
                <th className="py-1 pl-3 text-right font-medium">Kg / 1 000 barq. prévues</th>
                <th className="py-1 pl-3 text-right font-medium">Kg / 1 000 barq. produites</th>
                <th className="py-1 pl-3 text-right font-medium">Barq. perdues</th>
                <th className="py-1 pl-3 text-right font-medium">Pertes</th>
                {withCosts && <th className="py-1 pl-3 text-right font-medium">Coût brut</th>}
                <th className="py-1 pl-3 text-right font-medium">Barq. prévues</th>
                <th className="py-1 pl-3 text-right font-medium">Barq. produites</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={`border-t border-slate-100 ${i === 0 ? "font-semibold" : ""}`}>
                  <td className="py-2">{r.label}</td>
                  <td className={cell}>{r.point.foodKg != null ? num.format(r.point.foodKg) : "—"}</td>
                  <td className={cell}>{r.point.perThousand != null ? num.format(r.point.perThousand) : "—"}</td>
                  <td className={cell}>{r.point.perThousandActual != null ? num.format(r.point.perThousandActual) : "—"}</td>
                  <td className={cell}>{r.point.barquettes != null ? num.format(r.point.barquettes) : "—"}</td>
                  <td className={cell}>{r.point.events != null ? num.format(r.point.events) : "—"}</td>
                  {withCosts && <td className={cell}>{r.point.grossEur != null ? euro.format(r.point.grossEur) : "—"}</td>}
                  <td className={`${cell} text-slate-600`}>{r.point.planned != null ? num.format(r.point.planned) : "—"}</td>
                  <td className={`${cell} text-slate-600`}>{r.point.actual != null ? num.format(r.point.actual) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          « Kg / 1 000 barq. » : kg de pertes alimentaires pour 1 000 barquettes {scopeLabel} prévues au plan de production importé, ou
          produites d&apos;après le « Décompte barquettes » déposé. Il permet de comparer des semaines de volumes différents ; sans plan ou sans
          décompte, il n&apos;est pas calculé. Les moyennes ne comptent que les semaines qui ont ce volume.
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
            { value: "volume", label: "Pour 1 000 prévues" },
            { value: "reel", label: "Pour 1 000 produites" },
          ]}
        />
        <ColumnChart
          caption={
            measure === "kg"
              ? "Kg de pertes alimentaires par semaine"
              : `Kg de pertes pour 1 000 barquettes ${measure === "volume" ? "prévues" : "produites"}, par semaine`
          }
          columns={comparison.series.map((p) => {
            const value = measure === "kg" ? p.summary.foodKg : measure === "volume" ? p.perThousand : p.perThousandActual;
            return {
              key: p.id,
              label: `S${String(p.number).padStart(2, "0")}`,
              value,
              text: value == null ? "—" : `${num.format(value)} kg`,
              highlight: p.id === current.id,
            };
          })}
        />
        <p className="text-xs text-slate-500">
          {measure === "kg"
            ? "Kg de pertes alimentaires de chaque semaine de production."
            : measure === "volume"
              ? `Kg de pertes pour 1 000 barquettes ${scopeLabel} prévues ; un tiret : pas de plan importé.`
              : "Kg de pertes pour 1 000 barquettes produites (« Décompte barquettes ») ; un tiret : pas de décompte déposé."}
        </p>
      </Card>

      {withCosts && (
        <Card title="Coût des pertes semaine après semaine">
          <h3 className="font-medium">Coût brut, par composante</h3>
          <StackedColumnChart
            caption="Coût brut des pertes par semaine, réparti par composante"
            format={(n) => euro.format(n)}
            segments={COST_COMPONENTS.map((c) => ({ key: c.key, label: c.label, color: COMPONENT_COLORS[c.key] }))}
            columns={comparison.series.map((p) => ({
              key: `b-${p.id}`,
              label: `S${String(p.number).padStart(2, "0")}`,
              values: Object.fromEntries(COST_COMPONENTS.map((c) => [c.key, p.summary.cost?.[c.key] ?? 0])),
              total: p.summary.cost?.grossEur ?? 0,
              text: euro.format(p.summary.cost?.grossEur ?? 0),
              highlight: p.id === current.id,
            }))}
          />
          <h3 className="font-medium">Coût net (coût brut moins les recettes)</h3>
          <ColumnChart
            caption="Coût net des pertes par semaine"
            columns={comparison.series.map((p) => ({
              key: `n-${p.id}`,
              label: `S${String(p.number).padStart(2, "0")}`,
              value: Math.max(p.summary.cost?.netEur ?? 0, 0),
              text: euro.format(p.summary.cost?.netEur ?? 0),
              highlight: p.id === current.id,
            }))}
          />
          <h3 className="font-medium">Par mois</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 font-medium" />
                  <th className="py-1 pl-3 text-right font-medium">Coût brut</th>
                  <th className="py-1 pl-3 text-right font-medium">Recettes</th>
                  <th className="py-1 pl-3 text-right font-medium">Coût net</th>
                  <th className="py-1 pl-3 text-right font-medium">Évolution du net</th>
                </tr>
              </thead>
              <tbody>
                {shownMonths.map((m, i) => (
                  <tr key={`${m.year}-${m.month}`} className="border-t border-slate-100">
                    <td className="py-2">{`${MONTHS[m.month - 1]} ${m.year}`}</td>
                    <td className={cell}>{euro.format(m.summary.cost?.grossEur ?? 0)}</td>
                    <td className={cell}>{m.summary.cost?.recoveredEur ? `− ${euro.format(m.summary.cost.recoveredEur)}` : euro.format(0)}</td>
                    <td className={`${cell} font-medium`}>{euro.format(m.summary.cost?.netEur ?? 0)}</td>
                    <td className={`${cell} text-slate-600`}>{i > 0 ? shortTrend(m.summary.cost?.netEur ?? 0, shownMonths[i - 1]!.summary.cost?.netEur) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Coût figé sur chaque perte au moment de la saisie ; recettes : dons et ventes encaissés. La main-d&apos;œuvre et les charges indirectes
            n&apos;apparaissent que lorsqu&apos;elles sont imputées (méthode à définir). Les pertes sans coût connu ne sont pas comptées.
          </p>
        </Card>
      )}

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
      <ExportLinks tab="evolution" ctx={ctx} note="Les 12 dernières semaines (avec le détail du coût), les mois et les années, avec les mêmes filtres." />
    </div>
  );
}

function flat(p: WeekPoint) {
  return {
    perThousandActual: p.perThousandActual,
    actual: p.actual?.barquettes ?? null,
    foodKg: p.summary.foodKg,
    barquettes: p.summary.barquettes,
    events: p.summary.events,
    grossEur: p.summary.cost?.grossEur ?? null,
    perThousand: p.perThousand,
    planned: p.planned?.barquettes ?? null,
  };
}
