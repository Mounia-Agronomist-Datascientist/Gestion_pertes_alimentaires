import { TREND_LABELS, TREND_SYMBOLS, type TrendDirection } from "@/domain/tendances";
import type { TrendIndicator } from "@/modules/statistiques/evolution";
import { euro, num, pct } from "../shared";

/** Pour des pertes, une hausse est défavorable : couleur d'appoint, le sens est toujours écrit avec son symbole. */
const DIRECTION_CLASS: Record<TrendDirection, string> = { hausse: "text-red-800", stable: "text-slate-700", baisse: "text-emerald-800" };

/**
 * Tendance des indicateurs principaux (docs/PHASE6.md, étape 6.1) : moyenne des 4 dernières semaines comparée à
 * celle des 4 semaines d'avant.
 */
export function TrendTable({ trends, stableRate }: { trends: TrendIndicator[]; stableRate: number }) {
  const format = (t: TrendIndicator, v: number | null) => (v == null ? "—" : t.unit === "eur" ? euro.format(v) : `${num.format(v)} kg`);
  const cell = "py-2 pl-3 text-right tabular-nums whitespace-nowrap";
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">Tendance sur 8 semaines</caption>
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-medium">Indicateur</th>
              <th className="py-1 pl-3 text-right font-medium">4 dernières semaines</th>
              <th className="py-1 pl-3 text-right font-medium">4 semaines d&apos;avant</th>
              <th className="py-1 pl-3 text-right font-medium">Écart</th>
              <th className="py-1 pl-3 text-right font-medium">Tendance</th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t) => (
              <tr key={t.key} className="border-t border-slate-100">
                <td className="py-2">{t.label}</td>
                <td className={cell}>{format(t, t.trend.recent)}</td>
                <td className={cell}>{format(t, t.trend.previous)}</td>
                <td className={cell}>{t.trend.rate != null ? `${t.trend.rate > 0 ? "+" : t.trend.rate < 0 ? "−" : ""}${pct.format(Math.abs(t.trend.rate))}` : "—"}</td>
                <td className={`${cell} font-medium ${t.trend.direction ? DIRECTION_CLASS[t.trend.direction] : "text-slate-500"}`}>
                  {t.trend.direction ? `${TREND_SYMBOLS[t.trend.direction]} ${TREND_LABELS[t.trend.direction]}` : "Pas assez de semaines"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Moyenne des 4 dernières semaines de production (semaine choisie comprise) comparée à celle des 4 semaines d&apos;avant. « Stable » : écart de moins de{" "}
        {pct.format(stableRate)}. Il faut au moins 2 semaines connues dans chaque moyenne (une semaine sans plan importé ou sans décompte n&apos;a pas de kg
        pour 1 000 barquettes).
      </p>
    </>
  );
}
