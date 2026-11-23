/** Éléments communs des pages de statistiques : paramètres d'adresse, filtres, navigation, tuiles et barres. */
import { type DonutUnit, formatDonutValue } from "./donut-format";
import { ShareDonut } from "./share-donut";
import Link from "next/link";
import { db } from "@/db/client";
import { type Period, periodLabel, periodParams } from "@/domain/periodes";
import { type causeLenses, evolution, type StatsSummary } from "@/domain/statistiques";
import {
  AVOIDABILITIES,
  AVOIDABILITY_LABELS,
  CAUSE_FAMILIES,
  CAUSE_FAMILY_LABELS,
  UNCLASSIFIED,
  UNCLASSIFIED_LABEL,
} from "@/domain/familles-causes";
import type { AuthUser } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { type Params, type StatsContext, statsContext as parseStatsContext } from "@/modules/statistiques/context";
import { dashboardFilterOptions, DESTINATION_KIND_STATS } from "@/modules/statistiques/dashboard";
import { PeriodFields } from "./period-fields";

export const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
import type { ZoneFlowTile } from "@/domain/flux-zones";
export { isUuid, type Params, type StatsContext } from "@/modules/statistiques/context";

/** Période et filtres de la page, lus dans l'adresse. */
export const statsContext = (user: AuthUser, params: Params) => parseStatsContext(db, user, params);

/** Adresse d'une page de statistiques avec la période et les filtres (et des paramètres en plus). */
export function statsHref(
  path: string,
  ctx: StatsContext,
  period: Period = ctx.period,
  extra: Record<string, string> = {},
) {
  return `${path}?${new URLSearchParams({ ...periodParams(period), ...ctx.filterParams, ...extra })}`;
}

export function scopeNote(user: AuthUser, compareTeams: boolean): string | null {
  if (compareTeams) return null;
  return user.team
    ? `Équipe ${user.team.letter} – ${user.team.colorName} : vos pertes, dans vos zones.`
    : "Vos zones uniquement.";
}

const chip = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-brun-700 text-white" : "bg-white text-slate-700 shadow-sm"}`;

/** Onglets des statistiques (vue générale, par zone, par équipe). */
export function StatsTabs({
  user,
  ctx,
  active,
}: {
  user: AuthUser;
  ctx: StatsContext;
  active:
    | "general"
    | "zones"
    | "equipes"
    | "produits"
    | "causes"
    | "evolution"
    | "ratios"
    | "synthese"
    | "valorisation"
    | "environnement"
    | "alchimistes"
    | "rapports";
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Analyses">
      <Link className={chip(active === "general")} href={statsHref("/statistiques", ctx)}>
        Vue générale
      </Link>
      <Link className={chip(active === "synthese")} href={statsHref("/statistiques/synthese", ctx)}>
        Synthèse de la semaine
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
          <Link
            className={chip(active === "equipes")}
            href={statsHref("/statistiques/equipes", ctx, ctx.period, { id: user.teamId })}
          >
            Mon équipe
          </Link>
        )
      )}
      <Link className={chip(active === "evolution")} href={statsHref("/statistiques/evolution", ctx)}>
        Évolution
      </Link>
      <Link className={chip(active === "ratios")} href={statsHref("/statistiques/ratios", ctx)}>
        Ratios
      </Link>
      <Link className={chip(active === "produits")} href={statsHref("/statistiques/produits", ctx)}>
        Produits
      </Link>
      <Link className={chip(active === "causes")} href={statsHref("/statistiques/causes", ctx)}>
        Causes et destinations
      </Link>
      <Link className={chip(active === "valorisation")} href={statsHref("/statistiques/valorisation", ctx)}>
        Valorisation
      </Link>
      <Link className={chip(active === "environnement")} href={statsHref("/statistiques/environnement", ctx)}>
        Environnement
      </Link>
      {ctx.compareTeams && (
        <Link className={chip(active === "alchimistes")} href={statsHref("/statistiques/alchimistes", ctx)}>
          Alchimistes
        </Link>
      )}
      <Link className={chip(active === "rapports")} href={statsHref("/statistiques/rapports", ctx)}>
        Rapports PDF
      </Link>
    </nav>
  );
}

/** Choix d'une option dans l'adresse (pastilles), en gardant période et filtres. */
export function OptionChips<T extends string>({
  label,
  path,
  ctx,
  name,
  value,
  options,
  keep = {},
}: {
  label: string;
  path: string;
  ctx: StatsContext;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  keep?: Record<string, string>;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={label}>
      <span className="text-sm text-slate-600">{label} :</span>
      {options.map((o) => (
        <Link
          key={o.value}
          className={chip(o.value === value)}
          aria-current={o.value === value ? "true" : undefined}
          href={statsHref(path, ctx, ctx.period, { ...keep, [name]: o.value })}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** Périodes précédente et suivante. */
export function PeriodNav({
  path,
  ctx,
  previous,
  next,
  extra,
}: {
  path: string;
  ctx: StatsContext;
  previous: Period | null;
  next: Period | null;
  extra?: Record<string, string>;
}) {
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
export async function FilterForm({
  path,
  ctx,
  keep = {},
  hideZone = false,
  hideTeam = false,
}: {
  path: string;
  ctx: StatsContext;
  keep?: Record<string, string>;
  hideZone?: boolean;
  hideTeam?: boolean;
}) {
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
              {options.zones
                .filter((z) => ctx.zoneIds.includes(z.id))
                .map((z) => (
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
          <Link
            href={`${path}${Object.keys(keep).length ? `?${new URLSearchParams(keep)}` : ""}`}
            className="btn-secondary flex flex-1 items-center justify-center"
          >
            Réinitialiser
          </Link>
        </div>
      </form>
    </details>
  );
}

/** Évolution par rapport à la période précédente, en mots et en flèche (jamais par la seule couleur). */
export function trend(
  value: number,
  previous: number | null | undefined,
  previousLabel: string | null,
  unit: "kg" | "€" | "",
): string | null {
  const e = evolution(value, previous);
  if (!e || !previousLabel) return null;
  if (e.delta === 0) return `= stable par rapport à ${previousLabel}`;
  const arrow = e.delta > 0 ? "▲" : "▼";
  const amount =
    unit === "€" ? euro.format(Math.abs(e.delta)) : `${num.format(Math.abs(e.delta))}${unit ? ` ${unit}` : ""}`;
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
export function SummaryTiles({
  current,
  previous,
  previousLabel,
  withCosts,
}: {
  current: StatsSummary;
  previous: StatsSummary | null;
  previousLabel: string | null;
  withCosts: boolean;
}) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Indicateurs principaux">
      <Stat
        label="Pertes alimentaires"
        value={`${num.format(current.foodKg)} kg`}
        change={trend(current.foodKg, previous?.foodKg, previousLabel, "kg")}
      />
      {withCosts && current.cost && (
        <Stat
          label="Coût brut"
          value={euro.format(current.cost.grossEur)}
          change={trend(current.cost.grossEur, previous?.cost?.grossEur, previousLabel, "€")}
        />
      )}
      {withCosts && current.cost && (
        <Stat
          label="Coût net"
          value={euro.format(current.cost.netEur)}
          change={trend(current.cost.netEur, previous?.cost?.netEur, previousLabel, "€")}
        />
      )}
      <Stat
        label="Barquettes perdues"
        value={num.format(current.barquettes)}
        change={trend(current.barquettes, previous?.barquettes, previousLabel, "")}
      />
      <Stat
        label="Déclarations"
        value={String(current.events)}
        change={trend(current.events, previous?.events, previousLabel, "")}
      />
    </section>
  );
}

const UNIT_NAMES: Record<string, string> = { piece: "pièce(s)", barquette: "barquette(s)", kg: "kg", g: "g", l: "L" };
const plural = (n: number, word: string) => `${word}${n > 1 ? "s" : ""}`;

/** Remarques : pertes sans kg, emballages comptés à part, pertes sans coût. */
export function SummaryNotes({ summary, withCosts }: { summary: StatsSummary; withCosts: boolean }) {
  const notes: string[] = [];
  const n = summary.foodNotConverted;
  if (n > 0)
    notes.push(
      `${n} ${plural(n, "perte")} ${plural(n, "alimentaire")} sans poids en kg : non ${plural(n, "comptée")} dans les kg, jamais ${plural(n, "estimée")}.`,
    );
  if (summary.nonFood.events > 0)
    notes.push(
      `Emballages et moules perdus (comptés à part, jamais en kg alimentaires) : ${Object.entries(
        summary.nonFood.quantities,
      )
        .map(([unit, q]) => `${num.format(q)} ${UNIT_NAMES[unit] ?? unit}`)
        .join(", ")}.`,
    );
  const noCost = summary.cost ? summary.events - summary.cost.valued : 0;
  if (withCosts && noCost > 0)
    notes.push(
      `${noCost} ${plural(noCost, "perte")} sans coût connu (hors liste ou référentiel sans coût) : non ${plural(noCost, "comptée")} dans les euros.`,
    );
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
  /** Couleur propre à l'élément dans un anneau (couleur d'une équipe). */
  color?: string;
}

/**
 * Barres horizontales d'une seule couleur (une grandeur, pas d'identité de série) ; valeur et part écrites, la
 * barre ne porte jamais seule l'information. Sur téléphone, la barre occupe toute la largeur sous le libellé.
 */
export function BarTable({
  rows,
  caption,
  showShare = true,
}: {
  rows: BarRow[];
  caption: string;
  showShare?: boolean;
}) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col text-sm" aria-label={caption}>
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1 border-t border-slate-100 py-2 first:border-t-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              {r.href ? (
                <Link href={r.href} className="font-medium text-rouge-700 underline">
                  {r.label}
                </Link>
              ) : (
                r.label
              )}
            </span>
            <span className="shrink-0 tabular-nums whitespace-nowrap">
              {r.text}
              {showShare && (
                <span className="ml-2 inline-block w-10 text-right text-slate-600">
                  {total > 0 ? pct.format(r.value / total) : "—"}
                </span>
              )}
            </span>
          </div>
          <div className="h-2.5 rounded-r bg-slate-100" aria-hidden>
            {r.value > 0 && (
              <div className="h-2.5 rounded-r bg-brun-700" style={{ width: `${(r.value / max) * 100}%` }} />
            )}
          </div>
          {r.detail && <span className="text-xs text-slate-500">{r.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Répartition en anneau (6 parts + « Autres », total au centre) et liste complète repliée sous « Voir le détail »
 * (décision du 20/11/2026, R30).
 */
export function ShareChart({
  rows,
  caption,
  unit,
  keepOrder,
  colorOrder,
  detailLimit = 30,
}: {
  rows: BarRow[];
  caption: string;
  unit: DonutUnit;
  keepOrder?: boolean;
  colorOrder?: readonly string[];
  detailLimit?: number;
}) {
  const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
  const totalText = formatDonutValue(unit, total);
  return (
    <ShareDonut
      rows={rows}
      caption={caption}
      unit={unit}
      keepOrder={keepOrder}
      colorOrder={colorOrder}
      totalText={totalText}
    >
      {rows.length > 1 && (
        <>
          <BarTable caption={caption} rows={rows.slice(0, detailLimit)} />
          {rows.length > detailLimit && (
            <p className="text-xs text-slate-500">
              {detailLimit} premiers sur {rows.length}.
            </p>
          )}
        </>
      )}
    </ShareDonut>
  );
}

/** Devenir des pertes alimentaires (kg par type de destination, §19.1). */
export function DestinationBars({ summary }: { summary: StatsSummary }) {
  const rows = DESTINATION_KIND_STATS.map((d) => ({ ...d, kg: summary.kgByDestinationKind[d.kind] ?? 0 })).filter(
    (d, i) => i < 5 || d.kg > 0,
  );
  if (rows.every((r) => r.kg === 0)) return <p className="text-slate-600">Aucune quantité en kg sur cette période.</p>;
  const total = rows.reduce((a, r) => a + r.kg, 0);
  return (
    <ShareDonut
      caption="Kg par destination"
      keepOrder
      unit="kg"
      totalText={`${num.format(total)} kg`}
      rows={rows.map((r) => ({ key: r.kind, label: r.label, value: r.kg, text: `${num.format(r.kg)} kg` }))}
    />
  );
}

/** Précision d'une ligne de classement : nombre de pertes et coût brut si visible. */
export function detailOf(summary: StatsSummary): string {
  return `${summary.events} ${plural(summary.events, "perte")}${summary.cost ? ` · ${euro.format(summary.cost.grossEur)}` : ""}`;
}

/** Carte titrée ; `breakable` : à l'impression, peut s'étaler sur deux pages (plusieurs graphiques à la suite). */
export function Card({
  title,
  children,
  breakable = false,
}: {
  title: string;
  children: React.ReactNode;
  breakable?: boolean;
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ${breakable ? "print:break-inside-auto" : ""}`}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Boutons d'export de l'onglet (CSV et Excel), avec la période, les filtres et les choix de l'écran. */
export function ExportLinks({
  tab,
  ctx,
  keep = {},
  note,
}: {
  tab: string;
  ctx: StatsContext;
  keep?: Record<string, string>;
  note?: string;
}) {
  const href = (format: "csv" | "xlsx") =>
    statsHref("/statistiques/export", ctx, ctx.period, { ...keep, onglet: tab, format });
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm print:hidden">
      <h2 className="text-lg font-semibold">Exporter</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a className="btn-secondary flex flex-1 items-center justify-center" href={href("xlsx")}>
          Excel
        </a>
        <a className="btn-secondary flex flex-1 items-center justify-center" href={href("csv")}>
          CSV
        </a>
      </div>
      <p className="text-xs text-slate-500">
        {note ?? "Les tableaux de cet onglet, avec la même période et les mêmes filtres."}
      </p>
    </section>
  );
}

/**
 * Retours fournisseur, à part du total perdu (décision du 19/11/2026) : ils repartent chez le fournisseur et
 * donnent normalement un avoir.
 */
export function SupplierReturns({ summary, withCosts }: { summary: StatsSummary; withCosts: boolean }) {
  if (summary.events === 0) return null;
  return (
    <section
      className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      aria-label="Retours fournisseur"
    >
      <h2 className="font-semibold">Retours fournisseur (hors pertes)</h2>
      <p className="text-2xl font-bold">
        {num.format(summary.foodKg)} kg
        {withCosts && summary.cost && (
          <span className="text-lg font-semibold text-slate-700"> · {euro.format(summary.cost.grossEur)}</span>
        )}
      </p>
      <p className="text-sm text-slate-600">
        {summary.events} retour{summary.events > 1 ? "s" : ""} : non compté{summary.events > 1 ? "s" : ""} dans le total
        perdu, un avoir du fournisseur est attendu.
        {summary.foodNotConverted > 0 && ` Dont ${summary.foodNotConverted} sans poids en kg.`}
      </p>
    </section>
  );
}

/**
 * Une case par zone dans le sens de la marche en avant (décision du 18/11/2026) : jauge = part de la zone dans les
 * kg perdus, coût brut, kg, évolution des kg par rapport à la période précédente.
 */
/**
 * Pertes par zone en logigramme vertical, de haut en bas dans le sens de la marche en avant (décision du 20/11/2026) :
 * une étape par zone, reliées par une flèche.
 */
export function ZoneFlow({ tiles, previousLabel }: { tiles: ZoneFlowTile[]; previousLabel: string | null }) {
  if (tiles.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Pertes par zone, dans le sens de la marche en avant">
      <h2 className="text-lg font-semibold">Pertes par zone, dans le sens de la marche en avant</h2>
      <ol className="flex flex-col items-stretch">
        {tiles.map((t, i) => (
          <li key={t.zoneId} className="flex flex-col items-stretch">
            {i > 0 && (
              <span aria-hidden className="flex h-6 flex-col items-center print:h-4">
                <span className="w-0.5 flex-1 bg-brun-100" />
                <span className="-mt-1.5 text-sm leading-none text-brun-600">▼</span>
              </span>
            )}
            <ZoneTile tile={t} previousLabel={previousLabel} step={i + 1} />
          </li>
        ))}
      </ol>
      <p className="text-sm text-slate-500">
        Jauge : part de la zone dans les kg perdus de la période. Évolution : kg perdus par rapport à{" "}
        {previousLabel ?? "la période précédente"}.
      </p>
    </section>
  );
}

function ZoneTile({
  tile: t,
  previousLabel,
  step,
}: {
  tile: ZoneFlowTile;
  previousLabel: string | null;
  step: number;
}) {
  const share = Math.round(t.share * 100);
  const change =
    t.previousKg == null
      ? null
      : t.change == null
        ? t.kg > 0
          ? { text: "nouveau", tone: "text-amber-800" }
          : { text: "= stable", tone: "text-slate-600" }
        : t.change > 0.005
          ? { text: `▲ hausse +${pct.format(t.change)}`, tone: "text-amber-800" }
          : t.change < -0.005
            ? { text: `▼ baisse −${pct.format(-t.change)}`, tone: "text-emerald-800" }
            : { text: "= stable", tone: "text-slate-600" };
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)] print:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)] print:py-2">
      <span
        aria-hidden
        className="row-span-2 flex size-9 items-center justify-center rounded-full bg-brun-700 text-sm font-bold text-white sm:row-span-1"
      >
        {step}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">{t.name}</span>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={share}
          aria-label={`Part des kg perdus : ${share} %`}
        >
          <div className="h-full rounded-full bg-rouge-500" style={{ width: `${share}%` }} />
        </div>
        <span className="text-xs text-slate-600">{share} % des kg perdus</span>
      </div>
      <div className="col-start-2 flex min-w-0 flex-col gap-0.5 sm:col-start-3 sm:items-end sm:text-right print:col-start-3 print:items-end print:text-right">
        <span className="flex flex-wrap items-baseline gap-x-2 sm:justify-end">
          <span className="text-xl font-bold tabular-nums">{num.format(t.kg)} kg</span>
          {t.grossEur != null && (
            <span className="font-semibold text-slate-700 tabular-nums">{euro.format(t.grossEur)}</span>
          )}
        </span>
        {change && (
          <span className={`text-sm font-medium ${change.tone}`}>
            {change.text}
            {previousLabel && <span className="font-normal text-slate-500"> vs {previousLabel}</span>}
          </span>
        )}
        {t.returned && (
          <span className="text-xs text-slate-600">
            + retours fournisseur : {num.format(t.returned.kg)} kg
            {t.returned.grossEur != null && ` · ${euro.format(t.returned.grossEur)}`} (hors pertes, avoir attendu)
          </span>
        )}
        {t.notConverted > 0 && (
          <span className="text-xs text-amber-800">
            + {t.notConverted} perte{t.notConverted > 1 ? "s" : ""} non convertie{t.notConverted > 1 ? "s" : ""} en kg
          </span>
        )}
      </div>
    </div>
  );
}

type Lenses = ReturnType<typeof causeLenses>;

/**
 * Pertes évitables et familles de causes racines (décision du 23/11/2026) : deux cartes, chacune en euros (si le
 * profil les voit) et en kg. Classement réglé sur chaque cause dans Administration → Causes.
 */
export function CauseLensCards({ lenses, withCosts }: { lenses: Lenses; withCosts: boolean }) {
  if (!lenses.byAvoidability.length) return null;
  const avoidOrder = [...AVOIDABILITIES, UNCLASSIFIED] as string[];
  const familyOrder = [...CAUSE_FAMILIES, UNCLASSIFIED] as string[];
  const label = (key: string) =>
    key === UNCLASSIFIED
      ? UNCLASSIFIED_LABEL
      : ((AVOIDABILITY_LABELS as Record<string, string>)[key] ??
        (CAUSE_FAMILY_LABELS as Record<string, string>)[key] ??
        key);
  const rowsOf = (groups: Lenses["byFamily"], order: string[], m: "cout" | "kg"): BarRow[] =>
    [...groups]
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map((g) => {
        const eur = g.summary.cost?.grossEur ?? 0;
        return {
          key: g.key,
          label: label(g.key),
          value: m === "cout" ? eur : g.summary.foodKg,
          text: m === "cout" ? euro.format(eur) : `${num.format(g.summary.foodKg)} kg`,
          detail: detailOf(g.summary),
        };
      });
  const totalKg = lenses.byAvoidability.reduce((a, g) => a + g.summary.foodKg, 0);
  const avoidable = lenses.byAvoidability.find((g) => g.key === "evitable")?.summary;
  const pair = (groups: Lenses["byFamily"], order: string[], caption: string, keepOrder: boolean) => (
    <>
      {withCosts && (
        <>
          <h3 className="font-semibold">En euros</h3>
          <ShareChart
            unit="euro"
            caption={`${caption} (€)`}
            rows={rowsOf(groups, order, "cout")}
            colorOrder={order}
            keepOrder={keepOrder}
          />
        </>
      )}
      <h3 className="font-semibold">En kg</h3>
      <ShareChart
        unit="kg"
        caption={`${caption} (kg)`}
        rows={rowsOf(groups, order, "kg")}
        colorOrder={order}
        keepOrder={keepOrder}
      />
    </>
  );
  return (
    <>
      <Card title="Pertes évitables">
        {avoidable && totalKg > 0 && (
          <p className="text-lg">
            <strong>
              {num.format(avoidable.foodKg)} kg évitables ({pct.format(avoidable.foodKg / totalKg)})
            </strong>
            {withCosts && avoidable.cost && ` · ${euro.format(avoidable.cost.grossEur)}`}
          </p>
        )}
        {pair(lenses.byAvoidability, avoidOrder, "Pertes évitables ou non", true)}
        <p className="text-xs text-slate-500">
          D&apos;après la cause de chaque perte : épluchures, parures, fonds de gastro ou barquettes de test sont
          inévitables ; « Autres causes » est à évaluer. Réglage : Administration → Causes.
        </p>
      </Card>
      <Card title="Par famille de cause racine">
        {pair(lenses.byFamily, familyOrder, "Pertes par famille de cause", false)}
      </Card>
    </>
  );
}
