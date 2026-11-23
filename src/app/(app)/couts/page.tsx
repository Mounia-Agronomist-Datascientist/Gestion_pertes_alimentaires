import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { type Period, periodLabel, periodParams } from "@/domain/periodes";
import { addDays, computeProductionWeek, formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { COST_COMPONENTS, type CostTotals, periodCostSummary } from "@/modules/couts/summary";
import { statsContext } from "@/modules/statistiques/context";
import { adjacentOf } from "@/modules/statistiques/facts";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { PeriodFields } from "../statistiques/period-fields";
import { COMPONENT_COLORS } from "./colors";

export const metadata = { title: "Coûts — Pertes" };

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

const COMPONENT_NOTES: Partial<Record<(typeof COST_COMPONENTS)[number]["key"], string>> = {
  labourEur: "non imputée : méthode à définir",
  indirectEur: "prévues dans une version ultérieure",
};

const href = (period: Period) => `/couts?${new URLSearchParams(periodParams(period))}`;

/**
 * Coûts des pertes d'une période au choix (décision du 23/11/2026) : semaine, mois, année ou dates libres, avec
 * raccourcis ; totaux, composantes, équipes, zones et semaine par semaine recalculés pour la période.
 */
export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "indicators.read")) redirect("/");
  const params = await searchParams;
  // Ancienne adresse « ?jour=AAAA-MM-JJ » : la semaine de ce jour.
  if (params.jour && /^\d{4}-\d{2}-\d{2}$/.test(params.jour) && !params.periode) {
    const week = await findStoredProductionWeek(db, params.jour);
    if (week) redirect(href({ kind: "semaine", year: week.year, number: week.number }));
  }
  const ctx = await statsContext(db, user, params);
  const { period, today } = ctx;
  const [summary, previous, next] = await Promise.all([
    periodCostSummary(db, user, period),
    adjacentOf(db, period, -1),
    adjacentOf(db, period, 1),
  ]);
  const { totals } = summary;
  const chip = "rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm";
  const current = computeProductionWeek(today);
  const shortcuts: { label: string; period: Period }[] = [
    { label: "Semaine en cours", period: { kind: "semaine", year: current.year, number: current.number } },
    {
      label: "2 dernières semaines",
      period: { kind: "periode", from: addDays(current.startDate, -7), to: current.endDate },
    },
    {
      label: "Mois en cours",
      period: { kind: "mois", year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) },
    },
    { label: "Année en cours", period: { kind: "annee", year: current.year } },
  ];
  const isActive = (p: Period) => href(p) === href(period);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Coûts des pertes — {periodLabel(period)}</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Raccourcis de période">
        {shortcuts.map((x) => (
          <Link
            key={x.label}
            className={isActive(x.period) ? "rounded-full bg-brun-700 px-4 py-2 text-sm font-medium text-white" : chip}
            href={href(x.period)}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      <nav className="flex flex-wrap gap-2" aria-label="Période voisine">
        {previous && (
          <Link className={chip} href={href(previous)}>
            ← {periodLabel(previous)}
          </Link>
        )}
        {next && (
          <Link className={chip} href={href(next)}>
            {periodLabel(next)} →
          </Link>
        )}
      </nav>
      <details className="rounded-2xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold">Choisir une autre période</summary>
        <form method="get" action="/couts" className="mt-3 grid gap-3 sm:grid-cols-2">
          <PeriodFields period={period} today={today} />
          <button type="submit" className="btn-primary sm:col-span-2">
            Afficher
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Semaine et année : semaines de production (jeudi → mercredi). Mois et dates libres : date réelle de la perte
          (un an au plus).
        </p>
      </details>

      <section className="grid gap-2 sm:grid-cols-3" aria-label="Totaux de la période">
        <Stat label="Coût brut" value={euro.format(totals.grossEur)} />
        <Stat
          label="Recettes encaissées"
          value={totals.recoveredEur ? `− ${euro.format(totals.recoveredEur)}` : euro.format(0)}
        />
        <Stat label="Coût net" value={euro.format(totals.netEur)} strong />
      </section>
      <p className="text-sm text-slate-600">
        {summary.declarations} perte{summary.declarations > 1 ? "s" : ""} déclarée{summary.declarations > 1 ? "s" : ""}{" "}
        ({summary.netKg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg), dont {summary.valued} valorisée
        {summary.valued > 1 ? "s" : ""}.
        {summary.notValued > 0 &&
          ` ${summary.notValued} sans coût connu (produit hors liste ou du référentiel) : non comptée${summary.notValued > 1 ? "s" : ""}, jamais estimée${summary.notValued > 1 ? "s" : ""}.`}
        {summary.packagingIncomplete > 0 &&
          ` Emballages incomplets pour ${summary.packagingIncomplete} perte${summary.packagingIncomplete > 1 ? "s" : ""} (prix manquant à la date).`}
      </p>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Répartition du coût brut</h2>
        {totals.grossEur > 0 ? (
          <Breakdown totals={totals} />
        ) : (
          <p className="text-slate-600">Aucun coût sur cette période.</p>
        )}
      </section>

      {summary.byWeek.length > 1 && (
        <CostTable
          title="Semaine par semaine"
          rows={summary.byWeek.map((w) => ({ id: w.id, label: formatProductionWeek(w), totals: w }))}
          total={totals}
        />
      )}
      {summary.byTeam.length > 0 && (
        <CostTable
          title="Par équipe (cuisine)"
          rows={summary.byTeam.map((t) => ({
            id: t.id,
            label: `Équipe ${t.letter} – ${t.colorName}`,
            color: t.colorHex,
            totals: t,
          }))}
        />
      )}
      {summary.byZone.length > 0 && (
        <CostTable
          title="Par zone"
          rows={summary.byZone.map((z) => ({ id: z.id, label: z.name, totals: z }))}
          total={totals}
        />
      )}
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`text-2xl ${strong ? "font-bold" : "font-semibold"}`}>{value}</p>
    </div>
  );
}

/** Barre empilée à 100 % (part de chaque composante) + légende avec montants et pourcentages. */
function Breakdown({ totals }: { totals: CostTotals }) {
  const parts = COST_COMPONENTS.map((c) => ({ ...c, value: totals[c.key], share: totals[c.key] / totals.grossEur }));
  return (
    <>
      <div
        className="flex h-6 w-full gap-[2px] overflow-hidden rounded"
        role="img"
        aria-label="Répartition du coût brut par composante"
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.key}
              className="h-full first:rounded-l last:rounded-r"
              style={{ width: `${p.share * 100}%`, backgroundColor: COMPONENT_COLORS[p.key] }}
              title={`${p.label} : ${euro.format(p.value)} (${pct.format(p.share)})`}
            />
          ))}
      </div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Composante</th>
            <th>Montant</th>
            <th>Part</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.key} className="border-t border-slate-100">
              <td className="py-2">
                <span
                  className="mr-2 inline-block size-3 rounded-sm align-middle"
                  style={{ backgroundColor: COMPONENT_COLORS[p.key] }}
                  aria-hidden
                />
                {p.label}
                {COMPONENT_NOTES[p.key] && (
                  <span className="block pl-5 text-xs text-slate-500">{COMPONENT_NOTES[p.key]}</span>
                )}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap">{euro.format(p.value)}</td>
              <td className="w-16 py-2 pl-3 text-right tabular-nums whitespace-nowrap text-slate-600">
                {pct.format(p.share)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CostTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { id: string; label: string; color?: string; totals: CostTotals }[];
  /** Ligne « Total » (la somme des lignes fait le total de la période). */
  total?: CostTotals;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-medium" />
              <th className="py-1 text-right font-medium">Brut</th>
              <th className="py-1 text-right font-medium">Recettes</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2">
                  {r.color && (
                    <span
                      className="mr-2 inline-block size-3 rounded-sm align-middle"
                      style={{ backgroundColor: r.color }}
                      aria-hidden
                    />
                  )}
                  {r.label}
                </td>
                <td className="py-2 text-right tabular-nums">{euro.format(r.totals.grossEur)}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {r.totals.recoveredEur ? `− ${euro.format(r.totals.recoveredEur)}` : "—"}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{euro.format(r.totals.netEur)}</td>
              </tr>
            ))}
          </tbody>
          {total && rows.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-brun-700 font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{euro.format(total.grossEur)}</td>
                <td className="py-2 text-right tabular-nums">
                  {total.recoveredEur ? `− ${euro.format(total.recoveredEur)}` : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">{euro.format(total.netEur)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
