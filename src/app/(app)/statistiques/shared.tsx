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
import { zoneNameWithoutNumber } from "@/domain/nom-zone";
import type { ShareOfTotal } from "@/modules/statistiques/dashboard";
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
    | "fournisseurs"
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
      {(ctx.compareTeams || ctx.zoneIds.length > 1) && (
        // Compte d'une équipe ou d'un responsable d'une seule zone : pas d'onglet « Par zone » (24/11/2026).
        <Link className={chip(active === "zones")} href={statsHref("/statistiques/zones", ctx)}>
          Par zone
        </Link>
      )}
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
      <Link className={chip(active === "fournisseurs")} href={statsHref("/statistiques/fournisseurs", ctx)}>
        Fournisseurs
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

/** Au-delà de ce pourcentage, l'écart n'est plus parlant (période précédente presque vide) : « forte hausse ». */
const STRONG_CHANGE_PERCENT = 100;

/** Comparaison avec la période précédente : un mot court à l'écran, le détail chiffré au clic ou au survol. */
export interface Comparison {
  /** « ▲ +12 % », « ▲ forte hausse », « ▼ −8 % », « = stable », « nouveau ». */
  short: string;
  tone: string;
  /** Explication complète : valeurs des deux périodes, écart, pourcentage et comment il se lit. */
  detail: string;
}

/** Mot court d'une évolution en pourcentage (jamais par la seule couleur : flèche et mot). */
function changeWords(percent: number | null, delta: number): Pick<Comparison, "short" | "tone"> {
  if (delta === 0) return { short: "= stable", tone: "text-slate-600" };
  if (percent == null) return { short: "nouveau", tone: "text-amber-800" };
  if (percent >= STRONG_CHANGE_PERCENT) return { short: "▲ forte hausse", tone: "text-amber-800" };
  if (Math.abs(percent) < 0.5) return { short: "= stable", tone: "text-slate-600" };
  return percent > 0
    ? { short: `▲ +${num.format(Math.round(percent))} %`, tone: "text-amber-800" }
    : { short: `▼ −${num.format(Math.round(-percent))} %`, tone: "text-emerald-800" };
}

/** Évolution par rapport à la période précédente (null si elle n'est pas connue). */
export function compare(
  value: number,
  previous: number | null | undefined,
  labels: { previous: string | null; current?: string | null },
  unit: "kg" | "€" | "",
): Comparison | null {
  const e = evolution(value, previous);
  if (!e || !labels.previous || previous == null) return null;
  const fmt = (v: number) => (unit === "€" ? euro.format(v) : `${num.format(v)}${unit ? ` ${unit}` : ""}`);
  const sign = e.delta > 0 ? "+" : e.delta < 0 ? "−" : "";
  const parts = [
    `${labels.previous} : ${fmt(previous)} → ${labels.current ?? "cette période"} : ${fmt(value)}.`,
    `Écart : ${sign}${fmt(Math.abs(e.delta))}${e.percent != null ? `, soit ${sign}${num.format(Math.abs(e.percent))} %` : ""}.`,
  ];
  if (e.percent == null && value > 0) parts.push(`Rien en ${labels.previous} : pas de pourcentage possible.`);
  else if (e.percent != null && e.percent >= STRONG_CHANGE_PERCENT) {
    parts.push(
      `Le pourcentage compare à ${labels.previous} : il devient très grand quand cette période avait peu de pertes saisies.`,
    );
  }
  return { ...changeWords(e.percent, e.delta), detail: parts.join(" ") };
}

/** Évolution courte pour un tableau (« ▲ +12 % », « nouveau »). */
export function shortTrend(value: number, previous: number | null | undefined): string {
  const e = evolution(value, previous);
  if (!e) return "—";
  if (e.delta === 0) return "=";
  if (e.percent == null) return "nouveau";
  return `${e.delta > 0 ? "▲ +" : "▼ −"}${num.format(Math.abs(e.percent))} %`;
}

/** Évolution courte ; clic (ou survol) pour le détail chiffré. */
export function ComparisonNote({
  comparison: c,
  previousLabel,
  align = "left",
}: {
  comparison: Comparison;
  previousLabel: string;
  align?: "left" | "right";
}) {
  return (
    <details className="group relative text-sm">
      <summary title={c.detail} className="cursor-pointer list-none rounded-lg [&::-webkit-details-marker]:hidden">
        <span className={`font-medium whitespace-nowrap ${c.tone}`}>{c.short}</span>{" "}
        <span className="whitespace-nowrap text-slate-500">
          vs {previousLabel}{" "}
          <span
            aria-hidden
            className="inline-flex size-4 items-center justify-center rounded-full border border-slate-400 align-[-2px] text-[10px] leading-none text-slate-500 group-open:bg-slate-600 group-open:text-white"
          >
            i
          </span>
        </span>
        <span className="sr-only"> (voir le détail)</span>
      </summary>
      <p
        className={`absolute top-full z-10 mt-1 w-64 max-w-[80vw] rounded-lg bg-white p-3 text-left text-xs font-normal text-slate-700 shadow-lg ring-1 ring-slate-200 ${align === "right" ? "right-0" : "left-0"}`}
      >
        {c.detail}
      </p>
    </details>
  );
}

export function Stat({
  label,
  value,
  change,
  comparison,
  previousLabel,
}: {
  label: string;
  value: string;
  change?: string | null;
  comparison?: Comparison | null;
  previousLabel?: string | null;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="text-xl font-semibold whitespace-nowrap tabular-nums sm:text-2xl">{value}</p>
      {comparison && previousLabel && (
        <div className="mt-1">
          <ComparisonNote comparison={comparison} previousLabel={previousLabel} />
        </div>
      )}
      {change && <p className="mt-1 text-xs text-slate-600">{change}</p>}
    </div>
  );
}

/** Indicateurs principaux d'un agrégat, avec l'évolution si la période précédente est connue. */
export function SummaryTiles({
  current,
  previous,
  previousLabel,
  currentLabel,
  withCosts,
}: {
  current: StatsSummary;
  previous: StatsSummary | null;
  previousLabel: string | null;
  currentLabel?: string | null;
  withCosts: boolean;
}) {
  const labels = { previous: previousLabel, current: currentLabel };
  const tile = (
    label: string,
    value: string,
    now: number,
    before: number | null | undefined,
    unit: "kg" | "€" | "",
  ) => (
    <Stat label={label} value={value} comparison={compare(now, before, labels, unit)} previousLabel={previousLabel} />
  );
  return (
    <section className="flex flex-col gap-1" aria-label="Indicateurs principaux">
      <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-3">
        {tile("Pertes alimentaires", `${num.format(current.foodKg)} kg`, current.foodKg, previous?.foodKg, "kg")}
        {withCosts &&
          current.cost &&
          tile("Coût brut", euro.format(current.cost.grossEur), current.cost.grossEur, previous?.cost?.grossEur, "€")}
        {withCosts &&
          current.cost &&
          tile("Coût net", euro.format(current.cost.netEur), current.cost.netEur, previous?.cost?.netEur, "€")}
        {tile("Barquettes perdues", num.format(current.barquettes), current.barquettes, previous?.barquettes, "")}
        {tile("Déclarations", String(current.events), current.events, previous?.events, "")}
      </div>
      {previousLabel && (
        <p className="text-xs text-slate-500">
          Évolution par rapport à {previousLabel} ; touchez ⓘ (ou passez la souris) pour les chiffres.
        </p>
      )}
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
          {r.detail && <span className="text-xs whitespace-pre-line text-slate-500">{r.detail}</span>}
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
 * Part d'une équipe ou d'une zone dans les pertes (décision du 24/11/2026), à la place des pertes par zone pour les
 * comptes qui ne voient qu'une zone : équipe → part dans sa zone puis dans l'entreprise ; responsable de zone → part
 * dans l'entreprise, toutes zones confondues.
 */
export function ShareOfTotalCard({ share, withCosts }: { share: ShareOfTotal; withCosts: boolean }) {
  const rows = [
    ...(share.zone ? [{ label: `des pertes de la zone ${share.zone.name}`, of: share.zone.summary }] : []),
    { label: "des pertes de l'entreprise, toutes zones confondues", of: share.total },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm" aria-label="Part dans les pertes">
      <h2 className="text-lg font-semibold">
        {share.kind === "equipe"
          ? `Part de l'${share.label.charAt(0).toLowerCase()}${share.label.slice(1)}`
          : `Part de ${share.label}`}{" "}
        dans les pertes
      </h2>
      {rows.map((r) => {
        const ratio = r.of.foodKg > 0 ? share.own.foodKg / r.of.foodKg : null;
        const costRatio =
          withCosts && share.own.cost && r.of.cost && r.of.cost.grossEur > 0
            ? share.own.cost.grossEur / r.of.cost.grossEur
            : null;
        const width = Math.min(100, Math.round((ratio ?? 0) * 100));
        return (
          <div key={r.label} className="flex flex-col gap-1">
            <p>
              <span className="text-2xl font-bold tabular-nums">{ratio == null ? "—" : pct.format(ratio)}</span>{" "}
              <span className="text-slate-700">{r.label}</span>
            </p>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={width}
              aria-label={`Part ${r.label}`}
            >
              <div className="h-full rounded-full bg-rouge-500" style={{ width: `${width}%` }} />
            </div>
            <p className="text-sm text-slate-600">
              {num.format(share.own.foodKg)} kg sur {num.format(r.of.foodKg)} kg
              {costRatio != null &&
                ` · ${pct.format(costRatio)} du coût brut (${euro.format(share.own.cost!.grossEur)} sur ${euro.format(r.of.cost!.grossEur)})`}
            </p>
          </div>
        );
      })}
      <p className="text-xs text-slate-500">
        Pertes alimentaires en kg de la période, sans les retours fournisseur. Seuls les totaux sont comparés : le
        détail des autres {share.kind === "equipe" ? "équipes" : "zones"} reste réservé aux responsables.
      </p>
    </section>
  );
}

/**
 * Pertes par zone en logigramme vertical, de haut en bas dans le sens de la marche en avant (décision du 20/11/2026) :
 * une étape par zone, reliées par une flèche.
 */
export function ZoneFlow({
  tiles,
  previousLabel,
  currentLabel,
}: {
  tiles: ZoneFlowTile[];
  previousLabel: string | null;
  currentLabel?: string | null;
}) {
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
            <ZoneTile tile={t} previousLabel={previousLabel} currentLabel={currentLabel} step={i + 1} />
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
  currentLabel,
  step,
}: {
  tile: ZoneFlowTile;
  previousLabel: string | null;
  currentLabel?: string | null;
  step: number;
}) {
  const share = Math.round(t.share * 100);
  const change =
    previousLabel && t.previousKg != null
      ? compare(t.kg, t.previousKg, { previous: previousLabel, current: currentLabel }, "kg")
      : null;
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)] print:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)] print:py-2">
      <span
        aria-hidden
        className="row-span-2 flex size-9 items-center justify-center rounded-full bg-brun-700 text-sm font-bold text-white sm:row-span-1"
      >
        {step}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">{zoneNameWithoutNumber(t.name)}</span>
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
        {change && previousLabel && <ComparisonNote comparison={change} previousLabel={previousLabel} align="right" />}
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
