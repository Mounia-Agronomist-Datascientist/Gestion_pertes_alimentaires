"use client";

/**
 * Répartition en anneau (décision du 20/11/2026) : 6 parts au plus, le reste dans « Autres » ; total au centre ;
 * légende toujours écrite (nom, valeur, part) ; détail d'une part au survol, au toucher ou au clavier. Couleurs dans
 * un ordre fixe (palette catégorielle vérifiée, voir docs/REGLES_METIER.md R30), « Autres » en gris.
 */
import Link from "next/link";
import { useState } from "react";
import { type DonutUnit, formatDonutValue } from "./donut-format";
import { CHART, CHART_ORDER } from "./palette";

export type { DonutUnit };

export interface DonutRow {
  key: string;
  label: string;
  href?: string;
  value: number;
  /** Valeur écrite (« 12,5 kg », « 340,00 € »). */
  text: string;
  /** Précision au survol (« 3 pertes · 12,40 € »). */
  detail?: string;
  /** Couleur propre à l'élément (une équipe a sa couleur) ; sinon la palette. */
  color?: string;
}

/** Palette des graphiques : voir ./palette.ts. « Autres » en gris clair. */
const COLORS = CHART_ORDER;
const OTHER_COLOR = CHART.gris;
const MAX_SLICES = 6;
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

interface Slice extends DonutRow {
  color: string;
  share: number;
  /** Parts regroupées dans « Autres ». */
  folded?: DonutRow[];
}

/** Parts affichées : les 6 plus grandes (ou dans l'ordre donné), le reste regroupé. */
function slicesOf(
  rows: DonutRow[],
  keepOrder: boolean,
  unit: DonutUnit,
  total: number,
  colorOrder: readonly string[] | undefined,
): Slice[] {
  const positive = rows.filter((r) => r.value > 0);
  const ordered = keepOrder ? positive : [...positive].sort((a, b) => b.value - a.value);
  const shown = ordered.slice(0, MAX_SLICES);
  const rest = ordered.slice(shown.length);
  // Couleur fixée par élément (la même zone a la même couleur dans deux anneaux voisins) ; les autres parts prennent
  // les couleurs restantes, dans l'ordre.
  const fixed = new Map((colorOrder ?? []).slice(0, COLORS.length).map((k, i) => [k, COLORS[i]!]));
  const taken = new Set(shown.map((r) => fixed.get(r.key)).filter(Boolean));
  const pool = COLORS.filter((c) => !taken.has(c));
  const slices: Slice[] = shown.map((r) => ({
    ...r,
    color: r.color ?? fixed.get(r.key) ?? pool.shift() ?? OTHER_COLOR,
    share: total > 0 ? r.value / total : 0,
  }));
  const restValue = rest.reduce((a, r) => a + r.value, 0);
  if (rest.length) {
    slices.push({
      key: "__autres",
      label: `+ ${rest.length} ${rest.length > 1 ? "autres" : "autre"}`,
      value: restValue,
      text: formatDonutValue(unit, restValue),
      detail: rest
        .slice(0, 5)
        .map((r) => r.label)
        .join(", ")
        .concat(rest.length > 5 ? "…" : ""),
      color: OTHER_COLOR,
      share: total > 0 ? restValue / total : 0,
      folded: rest,
    });
  }
  return slices;
}

/** Arc d'anneau entre deux angles (radians, 0 en haut, sens horaire). */
function arcPath(cx: number, cy: number, r: number, inner: number, start: number, end: number): string {
  // Arrondi : le serveur et le navigateur doivent écrire exactement le même tracé.
  const p = (radius: number, a: number) =>
    `${(cx + radius * Math.sin(a)).toFixed(2)} ${(cy - radius * Math.cos(a)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${p(r, start)}`,
    `A ${r} ${r} 0 ${large} 1 ${p(r, end)}`,
    `L ${p(inner, end)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${p(inner, start)}`,
    "Z",
  ].join(" ");
}

export function ShareDonut({
  rows,
  caption,
  totalText,
  unit,
  keepOrder = false,
  colorOrder,
  children,
}: {
  rows: DonutRow[];
  /** Ce que montre l'anneau (lecteur d'écran, infobulle). */
  caption: string;
  /** Total écrit au centre (« 342 kg »). */
  totalText: string;
  unit: DonutUnit;
  /** Garder l'ordre donné (zones dans le sens de la marche en avant, devenirs) plutôt que du plus grand au plus petit. */
  keepOrder?: boolean;
  /** Clés dans l'ordre des couleurs : la même couleur pour le même élément d'un anneau à l'autre. */
  colorOrder?: readonly string[];
  /** Liste complète, ouverte par « Voir le détail » (jamais imprimée). */
  children?: React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
  if (total <= 0) return <p className="text-slate-600">Aucune quantité sur cette période.</p>;
  const slices = slicesOf(rows, keepOrder, unit, total, colorOrder);
  const current = slices.find((s) => s.key === active) ?? null;

  const size = 180;
  const c = size / 2;
  const r = c - 4;
  const inner = r * 0.62;
  // Angles cumulés : début de chaque part = somme des parts précédentes.
  const arcs = slices.map((s, i) => {
    const start = slices.slice(0, i).reduce((a, x) => a + x.share, 0) * Math.PI * 2;
    return { s, start, end: start + s.share * Math.PI * 2 };
  });

  return (
    <figure className="flex flex-col gap-3 break-inside-avoid">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start print:flex-row print:items-start print:gap-3">
        <div className="relative shrink-0" onMouseLeave={() => setActive(null)}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="size-44 print:size-32"
            role="img"
            aria-label={`${caption} : ${slices.map((s) => `${s.label} ${pct.format(s.share)}`).join(", ")}`}
          >
            {arcs.map(({ s, start, end }) =>
              slices.length === 1 ? (
                <circle
                  key={s.key}
                  cx={c}
                  cy={c}
                  r={(r + inner) / 2}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={r - inner}
                />
              ) : (
                <path
                  key={s.key}
                  d={arcPath(c, c, active === s.key ? r + 3 : r, inner, start, end)}
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="cursor-pointer outline-none"
                  opacity={active && active !== s.key ? 0.45 : 1}
                  tabIndex={0}
                  aria-label={`${s.label} : ${s.text}, ${pct.format(s.share)}`}
                  onMouseEnter={() => setActive(s.key)}
                  onFocus={() => setActive(s.key)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(s.key)}
                />
              ),
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {current ? (
              <>
                <span className="text-xl font-semibold tabular-nums print:text-xs">{pct.format(current.share)}</span>
                <span className="max-w-24 truncate text-xs text-slate-600">{current.label}</span>
              </>
            ) : (
              <>
                <span
                  className={`font-semibold tabular-nums print:text-xs ${totalText.length > 10 ? "max-w-24 text-sm leading-tight print:max-w-16 print:text-[0.6rem]" : "text-lg"}`}
                >
                  {totalText}
                </span>
                <span className="text-xs text-slate-600">au total</span>
              </>
            )}
          </div>
        </div>

        <ul className="flex w-full min-w-0 flex-col text-sm print:text-xs" aria-label={caption}>
          {slices.map((s) => (
            <li
              key={s.key}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 print:py-0.5 ${active === s.key ? "bg-slate-100" : ""}`}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(s.key)}
            >
              <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {s.href ? (
                  <Link href={s.href} className="font-medium text-rouge-700 underline">
                    {s.label}
                  </Link>
                ) : (
                  s.label
                )}
              </span>
              <span className="shrink-0 tabular-nums whitespace-nowrap text-slate-700">{s.text}</span>
              <span className="w-10 shrink-0 text-right font-medium tabular-nums">{pct.format(s.share)}</span>
            </li>
          ))}
        </ul>
      </div>

      {current && (current.detail || current.folded) && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 print:hidden" role="status">
          <strong>{current.label}</strong> — {current.text} ({pct.format(current.share)})
          {current.detail ? ` · ${current.detail}` : ""}
        </p>
      )}

      {children && (
        <details className="text-sm print:hidden">
          <summary className="cursor-pointer font-medium text-rouge-700">Voir le détail</summary>
          <div className="mt-2">{children}</div>
        </details>
      )}
    </figure>
  );
}
