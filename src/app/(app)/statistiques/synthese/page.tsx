import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { type Period, periodLabel, periodParams } from "@/domain/periodes";
import { formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { type WeeklyRow, weeklySummary } from "@/modules/statistiques/weekly";
import { ColumnChart } from "../evolution/column-chart";
import { TrendTable } from "../evolution/trend-table";
import {
  SupplierReturns,
  ShareChart,
  CauseLensCards,
  Card,
  euro,
  FilterForm,
  num,
  type Params,
  PeriodNav,
  pct,
  scopeNote,
  StatsTabs,
  statsContext,
  SummaryNotes,
  SummaryTiles,
  ZoneFlow,
} from "../shared";
import { PrintButton } from "./print-button";

export const metadata = { title: "Synthèse de la semaine — Pertes" };

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<Params> }) {
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
  const [data, next] = await Promise.all([weeklySummary(db, user, anchor, ctx.filters), adjacentOf(db, anchor, 1)]);
  if (!data) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const { comparison, withCosts } = data;
  const path = "/statistiques/synthese";
  const note = scopeNote(user, ctx.compareTeams);
  const previousLabel = data.previousPeriod ? periodLabel(data.previousPeriod) : null;
  const inEuros = data.by === "cout";
  const fmtValue = (v: number) => (inEuros ? euro.format(v) : `${num.format(v)} kg`);
  const exportHref = (format: "csv" | "xlsx", tableau?: string) =>
    `/statistiques/export?${new URLSearchParams({ ...periodParams(anchor), ...ctx.filterParams, onglet: "synthese", format, ...(tableau ? { tableau } : {}) })}`;
  // Répartition en euros ou en kg (décision du 20/11/2026 : les deux dans la synthèse) ; l'évolution n'est connue que
  // dans l'unité du classement.
  const measureRows = (list: WeeklyRow[], m: "cout" | "kg") =>
    list.map((r) => {
      const eur = r.summary.cost?.grossEur ?? 0;
      const kg = r.summary.foodKg;
      return {
        key: r.key,
        label: r.label,
        value: m === "cout" ? eur : kg,
        text: m === "cout" ? euro.format(eur) : `${num.format(kg)} kg`,
        detail: [
          `${r.summary.events} perte${r.summary.events > 1 ? "s" : ""}`,
          m === "cout" ? (kg > 0 ? `${num.format(kg)} kg` : null) : withCosts && eur > 0 ? euro.format(eur) : null,
          previousLabel && (m === "cout") === inEuros
            ? r.previous > 0
              ? `${r.delta > 0 ? "▲ +" : r.delta < 0 ? "▼ −" : "= "}${fmtValue(Math.abs(r.delta))} vs ${previousLabel}`
              : `nouveau vs ${previousLabel}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
  const series = comparison.series;
  const weekLabel = (n: number) => `S${String(n).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-4 print:gap-3">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700 print:hidden">
        ← Accueil
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Synthèse des pertes — {formatProductionWeek(anchor)}</h1>
        <PrintButton />
      </div>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <div className="flex flex-col gap-4 print:hidden">
        <StatsTabs user={user} ctx={ctx} active="synthese" />
        <PeriodNav path={path} ctx={ctx} previous={data.previousPeriod} next={next} />
        <FilterForm path={path} ctx={ctx} />
      </div>

      <SummaryTiles
        current={data.summary}
        previous={comparison.previous?.summary ?? null}
        previousLabel={previousLabel}
        withCosts={withCosts}
      />
      <SupplierReturns summary={data.supplierReturns} withCosts={withCosts} />
      <ZoneFlow tiles={data.zoneFlow} previousLabel={previousLabel} />
      {comparison.average && (
        <p className="text-sm text-slate-600">
          Moyenne des {comparison.average.weeks} semaines d&apos;avant : {num.format(comparison.average.foodKg ?? 0)} kg
          {withCosts && comparison.average.grossEur != null && `, ${euro.format(comparison.average.grossEur)} brut`}
          {comparison.current.perThousandActual != null &&
            ` · cette semaine : ${num.format(comparison.current.perThousandActual)} kg pour 1 000 barquettes produites`}
          .
        </p>
      )}
      <SummaryNotes summary={data.summary} withCosts={withCosts} />

      <Card title="Où s'améliorer en priorité">
        {data.summary.events === 0 ? (
          <p className="text-slate-600">Aucune perte cette semaine.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.byZone[0] && (
              <li>
                <strong>Zone</strong> : {data.byZone[0].label} — {fmtValue(data.byZone[0].value)} (
                {pct.format(data.byZone[0].share)} de la semaine)
              </li>
            )}
            {data.byCause[0] && (
              <li>
                <strong>Cause</strong> : {data.byCause[0].label} — {fmtValue(data.byCause[0].value)} (
                {pct.format(data.byCause[0].share)})
              </li>
            )}
            {data.byProduct[0] && (
              <li>
                <strong>Produit</strong> : {data.byProduct[0].label} — {fmtValue(data.byProduct[0].value)} (
                {pct.format(data.byProduct[0].share)})
              </li>
            )}
            {data.rises.length > 0 && (
              <li className="mt-1">
                <strong>En hausse par rapport à {previousLabel}</strong> :
                <ul className="mt-1 list-disc pl-5">
                  {data.rises.map((r) => (
                    <li key={`${r.kind}-${r.key}`}>
                      {r.kind} « {r.label} » : ▲ +{fmtValue(r.delta)} ({fmtValue(r.previous)} → {fmtValue(r.value)})
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          Classement {inEuros ? "en coût brut (euros)" : "en kg de pertes alimentaires"}.
        </p>
      </Card>

      {(
        [
          ["Par zone", data.byZone, "Impact économique (€)", "Poids perdu (kg)"],
          ["Par cause", data.byCause, "Impact économique (€)", "Poids perdu (kg)"],
          [
            "Par produit",
            data.byProduct,
            "Produits qui ont le plus gros impact économique (€)",
            "Produits les plus perdus en poids (kg)",
          ],
        ] as const
      )
        .filter(([, list]) => list.length > 0)
        .map(([title, list, euroTitle, kgTitle]) => {
          // Mêmes couleurs dans les deux anneaux : zones dans le sens de la marche en avant, sinon les plus grosses
          // parts du classement de la semaine.
          const colorOrder =
            title === "Par zone"
              ? data.zoneFlow.map((z) => z.zoneId)
              : [...list].sort((a, b) => b.value - a.value).map((r) => r.key);
          const rowsOf = (m: "cout" | "kg") =>
            measureRows(
              title === "Par zone"
                ? [...list].sort((a, b) => colorOrder.indexOf(a.key) - colorOrder.indexOf(b.key))
                : list,
              m,
            );
          return (
            <Card key={title} title={title}>
              {withCosts && (
                <>
                  <h3 className="font-semibold">{euroTitle}</h3>
                  <ShareChart
                    unit="euro"
                    caption={`${title} — ${euroTitle}`}
                    rows={rowsOf("cout")}
                    colorOrder={colorOrder}
                    keepOrder={title === "Par zone"}
                  />
                </>
              )}
              <h3 className="font-semibold">{kgTitle}</h3>
              <ShareChart
                unit="kg"
                caption={`${title} — ${kgTitle}`}
                rows={rowsOf("kg")}
                colorOrder={colorOrder}
                keepOrder={title === "Par zone"}
              />
            </Card>
          );
        })}

      <CauseLensCards lenses={data.lenses} withCosts={withCosts} />

      <Card title="Tendance sur 8 semaines">
        <TrendTable trends={comparison.trends} stableRate={comparison.trendStableRate} />
      </Card>

      <Card title="Semaine après semaine" breakable>
        {withCosts && (
          <>
            <h3 className="font-medium">Coût brut</h3>
            <ColumnChart
              caption="Coût brut des pertes par semaine"
              columns={series.map((p) => ({
                key: `c-${p.id}`,
                label: weekLabel(p.number),
                value: p.summary.cost?.grossEur ?? 0,
                text: euro.format(p.summary.cost?.grossEur ?? 0),
                highlight: p.id === comparison.current.id,
              }))}
            />
          </>
        )}
        <h3 className="font-medium">Kg de pertes alimentaires</h3>
        <ColumnChart
          caption="Kg de pertes alimentaires par semaine"
          columns={series.map((p) => ({
            key: `k-${p.id}`,
            label: weekLabel(p.number),
            value: p.summary.foodKg,
            text: `${num.format(p.summary.foodKg)} kg`,
            highlight: p.id === comparison.current.id,
          }))}
          average={{
            label: "Moyenne sur 4 semaines",
            values: comparison.trends.find((x) => x.key === "kg")!.average,
            text: (n) => `${num.format(n)} kg`,
          }}
        />
        <h3 className="font-medium">Kg pour 1 000 barquettes produites</h3>
        <ColumnChart
          caption="Kg de pertes pour 1 000 barquettes produites, par semaine"
          columns={series.map((p) => ({
            key: `r-${p.id}`,
            label: weekLabel(p.number),
            value: p.perThousandActual,
            text: p.perThousandActual == null ? "—" : `${num.format(p.perThousandActual)} kg`,
            highlight: p.id === comparison.current.id,
          }))}
          average={{
            label: "Moyenne sur 4 semaines",
            values: comparison.trends.find((x) => x.key === "reel")!.average,
            text: (n) => `${num.format(n)} kg`,
          }}
        />
        <p className="text-xs text-slate-500">
          12 dernières semaines de production ; un tiret : pas de « Décompte barquettes » déposé.
        </p>
      </Card>

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm print:hidden">
        <h2 className="text-lg font-semibold">Exporter</h2>
        <a className="btn-secondary flex items-center justify-center" href={exportHref("xlsx")}>
          Excel (les 12 semaines et le détail de la semaine)
        </a>
        <a className="btn-secondary flex items-center justify-center" href={exportHref("csv", "semaines")}>
          CSV : les 12 dernières semaines
        </a>
        <a className="btn-secondary flex items-center justify-center" href={exportHref("csv", "detail")}>
          CSV : détail de {formatProductionWeek(anchor)} (zones, causes, produits)
        </a>
        <p className="text-xs text-slate-500">
          Mêmes filtres que la page. Les graphiques se refont dans Excel à partir des colonnes.
        </p>
      </section>
    </div>
  );
}
