import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { type Period, periodLabel } from "@/domain/periodes";
import { formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { type RatioValues, weekRatios } from "@/modules/statistiques/ratios";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { ColumnChart } from "../evolution/column-chart";
import { Card, euro, FilterForm, num, OptionChips, type Params, PeriodNav, scopeNote, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Ratios — Statistiques — Pertes" };

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });

type Kind = "barquettes" | "kg" | "cout";
const KINDS: Record<Kind, { title: string; rate: (r: RatioValues) => number | null; detail: (r: RatioValues) => string | null; definition: string }> = {
  barquettes: {
    title: "Barquettes perdues / barquettes produites",
    rate: (r) => r.barquetteRate,
    detail: (r) => `${num.format(r.lostBarquettes)} / ${num.format(r.producedBarquettes)} barquettes`,
    definition: "Pertes saisies en barquettes, rapportées aux barquettes de la semaine. Les plats perdus saisis en kg n'y sont pas.",
  },
  kg: {
    title: "Kg de pertes alimentaires / kg produits",
    rate: (r) => r.kgRate,
    detail: (r) => (r.producedKg != null ? `${num.format(r.foodKg)} / ${num.format(r.producedKg)} kg` : null),
    definition:
      "Toutes les pertes alimentaires en kg nets (plats, sous-recettes, matières), rapportées aux kg de plats produits (barquettes × poids d'une portion du tome Melba). Les emballages ne sont jamais comptés.",
  },
  cout: {
    title: "Coût matières des pertes / coût matières de la production",
    rate: (r) => r.costRate,
    detail: (r) => (r.materialLossEur != null && r.productionCostEur != null ? `${euro.format(r.materialLossEur)} / ${euro.format(r.productionCostEur)}` : null),
    definition:
      "Coût matières figé sur chaque perte, rapporté au coût matières de la production (barquettes × coût Melba d'une portion). Main-d'œuvre, emballages et charges ne sont pas dans ce ratio.",
  },
};

export default async function RatiosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const base = await statsContext(user, params);
  let anchor: Extract<Period, { kind: "semaine" }> | null = base.period.kind === "semaine" ? base.period : null;
  if (!anchor) {
    const week = await findStoredProductionWeek(db, base.today);
    if (week) anchor = { kind: "semaine", year: week.year, number: week.number };
  }
  if (!anchor) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const ctx = { ...base, period: anchor as Period };
  const [ratios, previous, next] = await Promise.all([weekRatios(db, user, anchor, ctx.filters), adjacentOf(db, anchor, -1), adjacentOf(db, anchor, 1)]);
  if (!ratios) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const kinds = (Object.keys(KINDS) as Kind[]).filter((k) => k !== "cout" || ratios.withCosts);
  const chartKind: Kind = kinds.includes(params.ratio as Kind) ? (params.ratio as Kind) : "kg";
  const keep = { ratio: chartKind };
  const path = "/statistiques/ratios";
  const note = scopeNote(user, ctx.compareTeams);
  const scope = ratios.team ? "de l'équipe (codes attribués à l'équipe par le plan)" : "de toutes les équipes";
  const weekLabel = formatProductionWeek(anchor);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Ratios de pertes — {periodLabel(anchor)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="ratios" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} extra={keep} />
      <FilterForm path={path} ctx={ctx} keep={keep} />
      <p className="text-sm text-slate-600">
        Production {scope} : <strong>prévue</strong> d&apos;après le plan de production importé, <strong>réelle</strong> d&apos;après le « Décompte
        barquettes » déposé (colonne « Ma production »). Sans l&apos;un ou l&apos;autre, le ratio n&apos;est pas calculé.
      </p>

      {kinds.map((k) => (
        <Card key={k} title={KINDS[k].title}>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 text-sm">
            <span />
            <span className="font-medium text-slate-500">Sur le prévu</span>
            <span className="font-medium text-slate-500">Sur le réel</span>
            <span className="font-medium">{weekLabel}</span>
            <RatioCell values={ratios.week.prevu} kind={k} />
            <RatioCell values={ratios.week.reel} kind={k} />
            <span className="font-medium">
              {ratios.year.year}
              <span className="block text-xs font-normal text-slate-500">jusqu&apos;à {weekLabel}</span>
            </span>
            <RatioCell values={ratios.year.prevu} kind={k} showWeeks />
            <RatioCell values={ratios.year.reel} kind={k} showWeeks />
          </div>
          <p className="text-xs text-slate-500">{KINDS[k].definition}</p>
        </Card>
      ))}

      <Card title="Dernières semaines">
        <OptionChips label="Ratio" path={path} ctx={ctx} name="ratio" value={chartKind} keep={keep} options={kinds.map((k) => ({ value: k, label: k === "barquettes" ? "Barquettes" : k === "kg" ? "Kg" : "Coût" }))} />
        {(["prevu", "reel"] as const).map((source) => (
          <div key={source} className="flex flex-col gap-1">
            <h3 className="font-medium">{source === "prevu" ? "Sur la production prévue" : "Sur la production réelle"}</h3>
            <ColumnChart
              caption={`${KINDS[chartKind].title}, ${source === "prevu" ? "production prévue" : "production réelle"}, par semaine`}
              columns={ratios.series.map((w) => {
                const values = w[source];
                const value = values ? KINDS[chartKind].rate(values) : null;
                return {
                  key: w.id,
                  label: `S${String(w.number).padStart(2, "0")}`,
                  value: value == null ? null : value * 100,
                  text: value == null ? "—" : percent.format(value),
                  highlight: w.number === anchor.number && w.year === anchor.year,
                };
              })}
            />
          </div>
        ))}
        <p className="text-xs text-slate-500">Un tiret : pas de plan importé ou pas de décompte déposé pour cette semaine.</p>
      </Card>
    </div>
  );
}

function RatioCell({ values, kind, showWeeks = false }: { values: RatioValues | null; kind: Kind; showWeeks?: boolean }) {
  const rate = values ? KINDS[kind].rate(values) : null;
  if (!values || rate == null) return <span className="text-slate-500">non disponible</span>;
  const incomplete = (kind === "kg" && values.incomplete.weight > 0) || (kind === "cout" && values.incomplete.cost > 0);
  return (
    <span>
      <span className="text-lg font-semibold tabular-nums">{percent.format(rate)}</span>
      <span className="block text-xs text-slate-600 tabular-nums">{KINDS[kind].detail(values)}</span>
      {showWeeks && <span className="block text-xs text-slate-500">sur {values.weeks} semaine{values.weeks > 1 ? "s" : ""}</span>}
      {incomplete && <span className="block text-xs text-amber-700">dénominateur incomplet (codes sans {kind === "kg" ? "poids" : "coût"} Melba)</span>}
    </span>
  );
}
