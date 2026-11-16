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

/** Couleur de la moyenne glissante : contraste avec les colonnes vertes (palette catégorielle validée). */
const AVERAGE_COLOR = "#eb6834";

/**
 * `average` : moyenne glissante tracée en ligne sur les colonnes (même unité, même axe), avec sa légende et sa
 * colonne dans le tableau des valeurs.
 */
export function ColumnChart({ columns, caption, average }: { columns: Column[]; caption: string; average?: { label: string; values: (number | null)[]; text: (n: number) => string } }) {
  const width = 360;
  const height = 170;
  const top = 18;
  const bottom = 22;
  const max = Math.max(0, ...columns.map((c) => c.value ?? 0), ...(average?.values ?? []).map((v) => v ?? 0));
  const slot = width / Math.max(columns.length, 1);
  const bar = Math.min(22, slot - 6);
  const scale = (v: number) => (max > 0 ? (v / max) * (height - top - bottom) : 0);
  // Segments de la moyenne : interrompus là où elle n'est pas calculée.
  const segments: { x: number; y: number }[][] = [];
  average?.values.forEach((v, i) => {
    if (v == null) return segments.push([]);
    const point = { x: i * slot + slot / 2, y: height - bottom - scale(v) };
    if (!segments.length) segments.push([]);
    segments.at(-1)!.push(point);
  });
  return (
    <figure className="flex flex-col gap-2">
      {average && (
        <p className="flex items-center gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm bg-[#0f766e]" aria-hidden /> Semaine
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ background: AVERAGE_COLOR }} aria-hidden /> {average.label}
          </span>
        </p>
      )}
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
                <text {...valueAnchor(i, columns.length, x, bar)} y={Math.max(y - 4, 10)} fontSize={10} fontWeight={600} fill="#0f172a">
                  {c.text}
                </text>
              )}
              <text x={x + bar / 2} y={height - 6} textAnchor="middle" fontSize={9} fill="#475569">
                {c.label}
              </text>
            </g>
          );
        })}
        {segments
          .filter((s) => s.length > 0)
          .map((s, k) => (
            <g key={`avg-${k}`}>
              {s.length > 1 && <polyline points={s.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={AVERAGE_COLOR} strokeWidth={2} strokeLinejoin="round" />}
              {s.map((p) => (
                <circle key={`${p.x}`} cx={p.x} cy={p.y} r={2.5} fill={AVERAGE_COLOR} stroke="#ffffff" strokeWidth={1} />
              ))}
            </g>
          ))}
      </svg>
      <figcaption className="sr-only">{caption}</figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Voir les valeurs</summary>
        <table className="mt-2 w-full">
          <tbody>
            {average && (
              <tr className="text-slate-500">
                <th className="py-1 text-left font-medium" />
                <th className="py-1 text-right font-medium">Semaine</th>
                <th className="py-1 text-right font-medium">{average.label}</th>
              </tr>
            )}
            {columns.map((c, i) => (
              <tr key={c.key} className="border-t border-slate-100">
                <td className="py-1">{c.label}</td>
                <td className="py-1 text-right tabular-nums">{c.value != null ? c.text : "—"}</td>
                {average && <td className="py-1 text-right tabular-nums">{average.values[i] != null ? average.text(average.values[i]!) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Valeur écrite au-dessus d'une colonne : alignée sur le bord pour la première et la dernière, pour ne pas sortir du cadre. */
export function valueAnchor(i: number, count: number, x: number, bar: number) {
  if (count > 1 && i === count - 1) return { x: x + bar, textAnchor: "end" as const };
  if (count > 1 && i === 0) return { x, textAnchor: "start" as const };
  return { x: x + bar / 2, textAnchor: "middle" as const };
}
