import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { parsePeriod, type Period, periodLabel, periodParams } from "@/domain/periodes";
import { evolution, type StatsSummary } from "@/domain/statistiques";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { DESTINATION_KIND_STATS, dashboardFilterOptions, generalDashboard } from "@/modules/statistiques/dashboard";
import { canReadStats, type StatsFilters } from "@/modules/statistiques/facts";
import { PeriodFields } from "./period-fields";

export const metadata = { title: "Statistiques — Pertes" };

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const UUID = /^[0-9a-f-]{36}$/i;
const UNIT_NAMES: Record<string, string> = { piece: "pièce(s)", barquette: "barquette(s)", kg: "kg", g: "g", l: "L" };

type Params = Record<string, string | undefined>;

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const today = toProductionLocalDate(new Date());
  let period = parsePeriod(params);
  if (!period) {
    const week = await findStoredProductionWeek(db, today);
    period = week ? { kind: "semaine", year: week.year, number: week.number } : { kind: "mois", year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  }
  const compareTeams = can(user, "stats.compare_teams");
  const filters: StatsFilters = {
    zoneId: params.zone && UUID.test(params.zone) ? params.zone : undefined,
    teamId: compareTeams && params.equipe && UUID.test(params.equipe) ? params.equipe : undefined,
    category: params.categorie && (PRODUCT_CATEGORIES as readonly string[]).includes(params.categorie) ? params.categorie : undefined,
  };
  const [dashboard, options] = await Promise.all([generalDashboard(db, user, period, filters), dashboardFilterOptions(db)]);
  const { current, previous, withCosts } = dashboard;
  const filterParams = Object.fromEntries(
    Object.entries({ zone: filters.zoneId, equipe: filters.teamId, categorie: filters.category }).filter((e): e is [string, string] => !!e[1]),
  );
  const href = (p: Period) => `/statistiques?${new URLSearchParams({ ...periodParams(p), ...filterParams })}`;
  const chip = "rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm";
  const label = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  const scopeNote = compareTeams
    ? null
    : user.team
      ? `Équipe ${user.team.letter} – ${user.team.colorName} : vos pertes uniquement.`
      : "Vos zones uniquement.";
  const previousLabel = dashboard.previousPeriod ? periodLabel(dashboard.previousPeriod) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Statistiques — {periodLabel(period)}</h1>
      {scopeNote && <p className="text-sm text-slate-600">{scopeNote}</p>}

      <nav className="flex flex-wrap gap-2" aria-label="Période voisine">
        {dashboard.previousPeriod && (
          <Link className={chip} href={href(dashboard.previousPeriod)}>
            ← {periodLabel(dashboard.previousPeriod)}
          </Link>
        )}
        {dashboard.nextPeriod && (
          <Link className={chip} href={href(dashboard.nextPeriod)}>
            {periodLabel(dashboard.nextPeriod)} →
          </Link>
        )}
      </nav>

      <details className="rounded-2xl bg-white p-4 shadow-sm" open={Object.keys(filterParams).length > 0}>
        <summary className="cursor-pointer font-semibold">
          Filtres{Object.keys(filterParams).length > 0 && ` (${Object.keys(filterParams).length} actif${Object.keys(filterParams).length > 1 ? "s" : ""})`}
        </summary>
        <form method="get" action="/statistiques" className="mt-3 grid gap-3 sm:grid-cols-2">
          <PeriodFields period={period} today={today} />
          <label className={label}>
            Zone
            <select name="zone" defaultValue={filters.zoneId ?? ""} className="field w-full min-w-0">
              <option value="">Toutes</option>
              {options.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          {compareTeams && (
            <label className={label}>
              Équipe
              <select name="equipe" defaultValue={filters.teamId ?? ""} className="field w-full min-w-0">
                <option value="">Toutes</option>
                {options.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    Équipe {t.letter} – {t.colorName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={label}>
            Type de produit
            <select name="categorie" defaultValue={filters.category ?? ""} className="field w-full min-w-0">
              <option value="">Tous</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PRODUCT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <button type="submit" className="btn-primary flex-1">
              Afficher
            </button>
            <Link href="/statistiques" className="btn-secondary flex flex-1 items-center justify-center">
              Réinitialiser
            </Link>
          </div>
        </form>
      </details>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Indicateurs principaux">
        <Stat label="Pertes alimentaires" value={`${num.format(current.foodKg)} kg`} change={trend(current.foodKg, previous?.foodKg, previousLabel, " kg")} />
        {withCosts && current.cost && (
          <Stat label="Coût brut" value={euro.format(current.cost.grossEur)} change={trend(current.cost.grossEur, previous?.cost?.grossEur, previousLabel, " €")} />
        )}
        {withCosts && current.cost && <Stat label="Coût net" value={euro.format(current.cost.netEur)} change={trend(current.cost.netEur, previous?.cost?.netEur, previousLabel, " €")} />}
        <Stat label="Barquettes perdues" value={num.format(current.barquettes)} change={trend(current.barquettes, previous?.barquettes, previousLabel, "")} />
        <Stat label="Déclarations" value={String(current.events)} change={trend(current.events, previous?.events, previousLabel, "")} />
      </section>
      <Notes summary={current} withCosts={withCosts} />

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Devenir des pertes alimentaires</h2>
        <Destinations summary={current} />
      </section>

      <p className="text-sm text-slate-500">
        Le pourcentage de pertes par rapport à la production (prévue et réelle) sera ajouté avec les ratios (étape 4.6).
      </p>
    </div>
  );
}

/** Évolution par rapport à la période précédente, en mots et en flèche (jamais par la seule couleur). */
function trend(value: number, previous: number | null | undefined, previousLabel: string | null, unit: string): string | null {
  const e = evolution(value, previous);
  if (!e || !previousLabel) return null;
  if (e.delta === 0) return `= stable par rapport à ${previousLabel}`;
  const arrow = e.delta > 0 ? "▲" : "▼";
  const amount = unit === " €" ? euro.format(Math.abs(e.delta)) : `${num.format(Math.abs(e.delta))}${unit}`;
  return `${arrow} ${e.delta > 0 ? "+" : "−"}${amount}${e.percent != null ? ` (${e.percent > 0 ? "+" : "−"}${num.format(Math.abs(e.percent))} %)` : ""} par rapport à ${previousLabel}`;
}

function Stat({ label, value, change }: { label: string; value: string; change: string | null }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {change && <p className="mt-1 text-xs text-slate-600">{change}</p>}
    </div>
  );
}

function Notes({ summary, withCosts }: { summary: StatsSummary; withCosts: boolean }) {
  const notes: string[] = [];
  if (summary.foodNotConverted > 0)
    notes.push(`${summary.foodNotConverted} perte${summary.foodNotConverted > 1 ? "s" : ""} alimentaire${summary.foodNotConverted > 1 ? "s" : ""} sans poids en kg : non comptée${summary.foodNotConverted > 1 ? "s" : ""} dans les kg, jamais estimée${summary.foodNotConverted > 1 ? "s" : ""}.`);
  if (summary.nonFood.events > 0)
    notes.push(
      `Emballages et moules perdus (comptés à part, jamais en kg alimentaires) : ${Object.entries(summary.nonFood.quantities)
        .map(([unit, q]) => `${num.format(q)} ${UNIT_NAMES[unit] ?? unit}`)
        .join(", ")}.`,
    );
  if (withCosts && summary.cost && summary.events > summary.cost.valued)
    notes.push(`${summary.events - summary.cost.valued} perte${summary.events - summary.cost.valued > 1 ? "s" : ""} sans coût connu (hors liste ou référentiel sans coût) : non comptée${summary.events - summary.cost.valued > 1 ? "s" : ""} dans les euros.`);
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-slate-600">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

/** Kg par type de destination : barres horizontales d'une seule couleur, avec valeur et part écrites. */
function Destinations({ summary }: { summary: StatsSummary }) {
  const rows = DESTINATION_KIND_STATS.map((d) => ({ ...d, kg: summary.kgByDestinationKind[d.kind] ?? 0 })).filter(
    (d, i) => i < 5 || d.kg > 0,
  );
  const total = rows.reduce((a, r) => a + r.kg, 0);
  if (total === 0) return <p className="text-slate-600">Aucune quantité en kg sur cette période.</p>;
  const max = Math.max(...rows.map((r) => r.kg));
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Destination</th>
          <th>Kg</th>
          <th>Part</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.kind} className="border-t border-slate-100">
            <td className="w-32 py-2 pr-2">{r.label}</td>
            <td className="py-2" aria-hidden>
              <div className="h-3 rounded-r bg-slate-100">
                {r.kg > 0 && <div className="h-3 rounded-r bg-teal-700" style={{ width: `${(r.kg / max) * 100}%` }} />}
              </div>
            </td>
            <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap">{num.format(r.kg)} kg</td>
            <td className="w-12 py-2 pl-2 text-right tabular-nums text-slate-600">{pct.format(r.kg / total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
