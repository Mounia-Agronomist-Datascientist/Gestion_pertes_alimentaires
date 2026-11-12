/** Éléments communs des pages de statistiques : paramètres d'adresse, filtres, navigation, tuiles et barres. */
import Link from "next/link";
import { db } from "@/db/client";
import { parsePeriod, type Period, periodLabel, periodParams } from "@/domain/periodes";
import { evolution, type StatsSummary } from "@/domain/statistiques";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { dashboardFilterOptions, DESTINATION_KIND_STATS } from "@/modules/statistiques/dashboard";
import type { StatsFilters } from "@/modules/statistiques/facts";
import { PeriodFields } from "./period-fields";

export const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const UUID = /^[0-9a-f-]{36}$/i;
export const isUuid = (v: string | undefined): v is string => !!v && UUID.test(v);

export type Params = Record<string, string | undefined>;

export interface StatsContext {
  today: string;
  period: Period;
  filters: StatsFilters;
  /** Filtres actifs, à reporter dans les liens. */
  filterParams: Record<string, string>;
  compareTeams: boolean;
}

/** Période (semaine en cours par défaut) et filtres lus dans l'adresse, validés. */
export async function statsContext(user: AuthUser, params: Params): Promise<StatsContext> {
  const today = toProductionLocalDate(new Date());
  let period = parsePeriod(params);
  if (!period) {
    const week = await findStoredProductionWeek(db, today);
    period = week ? { kind: "semaine", year: week.year, number: week.number } : { kind: "mois", year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  }
  const compareTeams = can(user, "stats.compare_teams");
  const filters: StatsFilters = {
    zoneId: isUuid(params.zone) ? params.zone : undefined,
    teamId: compareTeams && isUuid(params.equipe) ? params.equipe : undefined,
    category: params.categorie && (PRODUCT_CATEGORIES as readonly string[]).includes(params.categorie) ? params.categorie : undefined,
  };
  const filterParams = Object.fromEntries(
    Object.entries({ zone: filters.zoneId, equipe: filters.teamId, categorie: filters.category }).filter((e): e is [string, string] => !!e[1]),
  );
  return { today, period, filters, filterParams, compareTeams };
}

/** Adresse d'une page de statistiques avec la période et les filtres (et des paramètres en plus). */
export function statsHref(path: string, ctx: StatsContext, period: Period = ctx.period, extra: Record<string, string> = {}) {
  return `${path}?${new URLSearchParams({ ...periodParams(period), ...ctx.filterParams, ...extra })}`;
}

export function scopeNote(user: AuthUser, compareTeams: boolean): string | null {
  if (compareTeams) return null;
  return user.team ? `Équipe ${user.team.letter} – ${user.team.colorName} : vos pertes uniquement.` : "Vos zones uniquement.";
}

const chip = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-teal-700 text-white" : "bg-white text-slate-700 shadow-sm"}`;

/** Onglets des statistiques (vue générale, par zone, par équipe). */
export function StatsTabs({ user, ctx, active }: { user: AuthUser; ctx: StatsContext; active: "general" | "zones" | "equipes" | "produits" | "causes" }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Analyses">
      <Link className={chip(active === "general")} href={statsHref("/statistiques", ctx)}>
        Vue générale
      </Link>
      <Link className={chip(active === "zones")} href={statsHref("/statistiques/zones", ctx)}>
        Par zone
      </Link>
      {ctx.compareTeams ? (
        <Link className={chip(active === "equipes")} href={statsHref("/statistiques/equipes", ctx)}>
          Par équipe
        </Link>
      ) : (
        user.teamId && (
          <Link className={chip(active === "equipes")} href={statsHref("/statistiques/equipes", ctx, ctx.period, { id: user.teamId })}>
            Mon équipe
          </Link>
        )
      )}
      <Link className={chip(active === "produits")} href={statsHref("/statistiques/produits", ctx)}>
        Produits
      </Link>
      <Link className={chip(active === "causes")} href={statsHref("/statistiques/causes", ctx)}>
        Causes et destinations
      </Link>
    </nav>
  );
}

/** Choix d'une option dans l'adresse (pastilles), en gardant période et filtres. */
export function OptionChips<T extends string>({ label, path, ctx, name, value, options, keep = {} }: { label: string; path: string; ctx: StatsContext; name: string; value: T; options: { value: T; label: string }[]; keep?: Record<string, string> }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={label}>
      <span className="text-sm text-slate-600">{label} :</span>
      {options.map((o) => (
        <Link key={o.value} className={chip(o.value === value)} aria-current={o.value === value ? "true" : undefined} href={statsHref(path, ctx, ctx.period, { ...keep, [name]: o.value })}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Périodes précédente et suivante. */
export function PeriodNav({ path, ctx, previous, next, extra }: { path: string; ctx: StatsContext; previous: Period | null; next: Period | null; extra?: Record<string, string> }) {
  const c = "rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm";
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Période voisine">
      {previous && (
        <Link className={c} href={statsHref(path, ctx, previous, extra)}>
          ← {periodLabel(previous)}
        </Link>
      )}
      {next && (
        <Link className={c} href={statsHref(path, ctx, next, extra)}>
          {periodLabel(next)} →
        </Link>
      )}
    </nav>
  );
}

/** Barre de filtres (formulaire GET) : période, zone, équipe (profils qui comparent), type de produit. */
export async function FilterForm({ path, ctx, keep = {}, hideZone = false, hideTeam = false }: { path: string; ctx: StatsContext; keep?: Record<string, string>; hideZone?: boolean; hideTeam?: boolean }) {
  const options = await dashboardFilterOptions(db);
  const { filters, filterParams } = ctx;
  const active = Object.keys(filterParams).length;
  const label = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  return (
    <details className="rounded-2xl bg-white p-4 shadow-sm" open={active > 0}>
      <summary className="cursor-pointer font-semibold">
        Période et filtres{active > 0 && ` (${active} filtre${active > 1 ? "s" : ""} actif${active > 1 ? "s" : ""})`}
      </summary>
      <form method="get" action={path} className="mt-3 grid gap-3 sm:grid-cols-2">
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <PeriodFields period={ctx.period} today={ctx.today} />
        {!hideZone && (
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
        )}
        {ctx.compareTeams && !hideTeam && (
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
          <Link href={`${path}${Object.keys(keep).length ? `?${new URLSearchParams(keep)}` : ""}`} className="btn-secondary flex flex-1 items-center justify-center">
            Réinitialiser
          </Link>
        </div>
      </form>
    </details>
  );
}

/** Évolution par rapport à la période précédente, en mots et en flèche (jamais par la seule couleur). */
export function trend(value: number, previous: number | null | undefined, previousLabel: string | null, unit: "kg" | "€" | ""): string | null {
  const e = evolution(value, previous);
  if (!e || !previousLabel) return null;
  if (e.delta === 0) return `= stable par rapport à ${previousLabel}`;
  const arrow = e.delta > 0 ? "▲" : "▼";
  const amount = unit === "€" ? euro.format(Math.abs(e.delta)) : `${num.format(Math.abs(e.delta))}${unit ? ` ${unit}` : ""}`;
  return `${arrow} ${e.delta > 0 ? "+" : "−"}${amount}${e.percent != null ? ` (${e.percent > 0 ? "+" : "−"}${num.format(Math.abs(e.percent))} %)` : ""} par rapport à ${previousLabel}`;
}

/** Évolution courte pour un tableau (« ▲ +12 % », « nouveau »). */
export function shortTrend(value: number, previous: number | null | undefined): string {
  const e = evolution(value, previous);
  if (!e) return "—";
  if (e.delta === 0) return "=";
  if (e.percent == null) return "nouveau";
  return `${e.delta > 0 ? "▲ +" : "▼ −"}${num.format(Math.abs(e.percent))} %`;
}

export function Stat({ label, value, change }: { label: string; value: string; change?: string | null }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {change && <p className="mt-1 text-xs text-slate-600">{change}</p>}
    </div>
  );
}

/** Indicateurs principaux d'un agrégat, avec l'évolution si la période précédente est connue. */
export function SummaryTiles({ current, previous, previousLabel, withCosts }: { current: StatsSummary; previous: StatsSummary | null; previousLabel: string | null; withCosts: boolean }) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Indicateurs principaux">
      <Stat label="Pertes alimentaires" value={`${num.format(current.foodKg)} kg`} change={trend(current.foodKg, previous?.foodKg, previousLabel, "kg")} />
      {withCosts && current.cost && <Stat label="Coût brut" value={euro.format(current.cost.grossEur)} change={trend(current.cost.grossEur, previous?.cost?.grossEur, previousLabel, "€")} />}
      {withCosts && current.cost && <Stat label="Coût net" value={euro.format(current.cost.netEur)} change={trend(current.cost.netEur, previous?.cost?.netEur, previousLabel, "€")} />}
      <Stat label="Barquettes perdues" value={num.format(current.barquettes)} change={trend(current.barquettes, previous?.barquettes, previousLabel, "")} />
      <Stat label="Déclarations" value={String(current.events)} change={trend(current.events, previous?.events, previousLabel, "")} />
    </section>
  );
}

const UNIT_NAMES: Record<string, string> = { piece: "pièce(s)", barquette: "barquette(s)", kg: "kg", g: "g", l: "L" };
const plural = (n: number, word: string) => `${word}${n > 1 ? "s" : ""}`;

/** Remarques : pertes sans kg, emballages comptés à part, pertes sans coût. */
export function SummaryNotes({ summary, withCosts }: { summary: StatsSummary; withCosts: boolean }) {
  const notes: string[] = [];
  const n = summary.foodNotConverted;
  if (n > 0) notes.push(`${n} ${plural(n, "perte")} ${plural(n, "alimentaire")} sans poids en kg : non ${plural(n, "comptée")} dans les kg, jamais ${plural(n, "estimée")}.`);
  if (summary.nonFood.events > 0)
    notes.push(
      `Emballages et moules perdus (comptés à part, jamais en kg alimentaires) : ${Object.entries(summary.nonFood.quantities)
        .map(([unit, q]) => `${num.format(q)} ${UNIT_NAMES[unit] ?? unit}`)
        .join(", ")}.`,
    );
  const noCost = summary.cost ? summary.events - summary.cost.valued : 0;
  if (withCosts && noCost > 0) notes.push(`${noCost} ${plural(noCost, "perte")} sans coût connu (hors liste ou référentiel sans coût) : non ${plural(noCost, "comptée")} dans les euros.`);
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-slate-600">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

export interface BarRow {
  key: string;
  label: string;
  /** Lien vers le détail, facultatif. */
  href?: string;
  value: number;
  /** Texte de la valeur (ex. « 12,5 kg »). */
  text: string;
  /** Précision sous le libellé (ex. « 3 pertes · 12,40 € »). */
  detail?: string;
}

/**
 * Barres horizontales d'une seule couleur (une grandeur, pas d'identité de série) ; valeur et part écrites, la
 * barre ne porte jamais seule l'information. Sur téléphone, la barre occupe toute la largeur sous le libellé.
 */
export function BarTable({ rows, caption, showShare = true }: { rows: BarRow[]; caption: string; showShare?: boolean }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col text-sm" aria-label={caption}>
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1 border-t border-slate-100 py-2 first:border-t-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              {r.href ? (
                <Link href={r.href} className="font-medium text-teal-800 underline">
                  {r.label}
                </Link>
              ) : (
                r.label
              )}
            </span>
            <span className="shrink-0 tabular-nums whitespace-nowrap">
              {r.text}
              {showShare && <span className="ml-2 inline-block w-10 text-right text-slate-600">{total > 0 ? pct.format(r.value / total) : "—"}</span>}
            </span>
          </div>
          <div className="h-2.5 rounded-r bg-slate-100" aria-hidden>
            {r.value > 0 && <div className="h-2.5 rounded-r bg-teal-700" style={{ width: `${(r.value / max) * 100}%` }} />}
          </div>
          {r.detail && <span className="text-xs text-slate-500">{r.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Devenir des pertes alimentaires (kg par type de destination, §19.1). */
export function DestinationBars({ summary }: { summary: StatsSummary }) {
  const rows = DESTINATION_KIND_STATS.map((d) => ({ ...d, kg: summary.kgByDestinationKind[d.kind] ?? 0 })).filter((d, i) => i < 5 || d.kg > 0);
  if (rows.every((r) => r.kg === 0)) return <p className="text-slate-600">Aucune quantité en kg sur cette période.</p>;
  return <BarTable caption="Kg par destination" rows={rows.map((r) => ({ key: r.kind, label: r.label, value: r.kg, text: `${num.format(r.kg)} kg` }))} />;
}

/** Précision d'une ligne de classement : nombre de pertes et coût brut si visible. */
export function detailOf(summary: StatsSummary): string {
  return `${summary.events} ${plural(summary.events, "perte")}${summary.cost ? ` · ${euro.format(summary.cost.grossEur)}` : ""}`;
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
