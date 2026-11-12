/**
 * Colonnes empilées : une grandeur (euros) répartie en composantes de couleur fixe, semaine après semaine.
 * Légende écrite au-dessus, total au survol et sur la colonne mise en avant, tableau des valeurs en dessous
 * (§25 : jamais l'information par la seule couleur).
 */
import { valueAnchor } from "./column-chart";

export interface Segment {
  key: string;
  label: string;
  color: string;
}

export interface StackedColumn {
  key: string;
  label: string;
  values: Record<string, number>;
  total: number;
  text: string;
  highlight?: boolean;
}

export function StackedColumnChart({ columns, segments, caption, format }: { columns: StackedColumn[]; segments: Segment[]; caption: string; format: (n: number) => string }) {
  const width = 360;
  const height = 170;
  const top = 18;
  const bottom = 22;
  const gap = 2;
  const max = Math.max(0, ...columns.map((c) => c.total));
  const slot = width / Math.max(columns.length, 1);
  const bar = Math.min(22, slot - 6);
  const scale = (v: number) => (max > 0 ? (v / max) * (height - top - bottom) : 0);
  // Seules les composantes présentes sur la période sont légendées.
  const shown = segments.filter((s) => columns.some((c) => (c.values[s.key] ?? 0) > 0));
  return (
    <figure className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700" aria-label="Légende">
        {shown.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={caption}>
        <line x1={0} x2={width} y1={height - bottom} y2={height - bottom} stroke="#cbd5e1" strokeWidth={1} />
        {columns.map((c, i) => {
          const x = i * slot + (slot - bar) / 2;
          let y = height - bottom;
          const parts = shown
            .map((s) => ({ s, h: scale(c.values[s.key] ?? 0) }))
            .filter((p) => p.h > 0)
            .map((p) => {
              y -= p.h;
              return { ...p, y };
            });
          const topY = parts.at(-1)?.y ?? height - bottom;
          return (
            <g key={c.key}>
              <title>{[`${c.label} : ${c.text}`, ...shown.filter((s) => (c.values[s.key] ?? 0) > 0).map((s) => `${s.label} : ${format(c.values[s.key]!)}`)].join("\n")}</title>
              <rect x={i * slot} y={0} width={slot} height={height - bottom} fill="transparent" />
              {parts.map((p, j) => (
                // Écart de 2 px entre deux composantes (couleur du fond), sauf sous la première.
                <rect key={p.s.key} x={x} y={p.y} width={bar} height={Math.max(p.h - (j > 0 ? gap : 0), 1)} fill={p.s.color} opacity={c.highlight || !columns.some((o) => o.highlight) ? 1 : 0.8} />
              ))}
              {c.highlight && c.total > 0 && (
                <text {...valueAnchor(i, columns.length, x, bar)} y={Math.max(topY - 4, 10)} fontSize={10} fontWeight={600} fill="#0f172a">
                  {c.text}
                </text>
              )}
              <text x={x + bar / 2} y={height - 6} textAnchor="middle" fontSize={9} fill="#475569" fontWeight={c.highlight ? 700 : 400}>
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{caption}</figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Voir les valeurs</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[28rem]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 font-medium" />
                {shown.map((s) => (
                  <th key={s.key} className="py-1 pl-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
                <th className="py-1 pl-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.key} className="border-t border-slate-100">
                  <td className="py-1">{c.label}</td>
                  {shown.map((s) => (
                    <td key={s.key} className="py-1 pl-3 text-right tabular-nums whitespace-nowrap">
                      {format(c.values[s.key] ?? 0)}
                    </td>
                  ))}
                  <td className="py-1 pl-3 text-right font-medium tabular-nums whitespace-nowrap">{c.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
