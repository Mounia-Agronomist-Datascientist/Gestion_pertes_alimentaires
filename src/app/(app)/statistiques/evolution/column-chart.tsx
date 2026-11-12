/**
 * Histogramme d'une seule série (une grandeur dans le temps) : colonnes d'une seule couleur, la colonne mise en
 * avant plus foncée et étiquetée, valeur au survol, et tableau des valeurs juste en dessous (§25 : jamais
 * l'information par la seule image).
 */
export interface Column {
  key: string;
  label: string;
  /** null : valeur inconnue (ex. pas de volume prévu) — colonne absente, signalée par un tiret. */
  value: number | null;
  text: string;
  highlight?: boolean;
}

export function ColumnChart({ columns, caption }: { columns: Column[]; caption: string }) {
  const width = 360;
  const height = 170;
  const top = 18;
  const bottom = 22;
  const max = Math.max(0, ...columns.map((c) => c.value ?? 0));
  const slot = width / Math.max(columns.length, 1);
  const bar = Math.min(22, slot - 6);
  const scale = (v: number) => (max > 0 ? (v / max) * (height - top - bottom) : 0);
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={caption}>
        <line x1={0} x2={width} y1={height - bottom} y2={height - bottom} stroke="#cbd5e1" strokeWidth={1} />
        {columns.map((c, i) => {
          const x = i * slot + (slot - bar) / 2;
          const h = c.value != null ? Math.max(scale(c.value), c.value > 0 ? 2 : 0) : 0;
          const y = height - bottom - h;
          return (
            <g key={c.key}>
              <title>{`${c.label} : ${c.text}`}</title>
              {/* Zone de survol plus large que la colonne. */}
              <rect x={i * slot} y={0} width={slot} height={height - bottom} fill="transparent" />
              {c.value != null && h > 0 && <rect x={x} y={y} width={bar} height={h} rx={3} fill={c.highlight ? "#0f4f4a" : "#0f766e"} opacity={c.highlight ? 1 : 0.75} />}
              {c.value == null && (
                <text x={x + bar / 2} y={height - bottom - 4} textAnchor="middle" fontSize={10} fill="#94a3b8">
                  –
                </text>
              )}
              {c.highlight && c.value != null && (
                <text x={x + bar / 2} y={Math.max(y - 4, 10)} textAnchor="middle" fontSize={10} fontWeight={600} fill="#0f172a">
                  {c.text}
                </text>
              )}
              <text x={x + bar / 2} y={height - 6} textAnchor="middle" fontSize={9} fill="#475569">
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{caption}</figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Voir les valeurs</summary>
        <table className="mt-2 w-full">
          <tbody>
            {columns.map((c) => (
              <tr key={c.key} className="border-t border-slate-100">
                <td className="py-1">{c.label}</td>
                <td className="py-1 text-right tabular-nums">{c.value != null ? c.text : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
