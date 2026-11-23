/**
 * Mise en page de « Import de la semaine » par jour (décision du 23/11/2026) : pour chaque document, ce que c'est,
 * la semaine de production concernée (S, S-1, S+1) et à quoi il sert, avant sa zone de dépôt.
 */
import { addDays, computeProductionWeek, formatProductionWeek, type ProductionWeek } from "@/domain/semaine-production";

export type WeekOffset = -1 | 0 | 1;

const OFFSET_LABELS: Record<WeekOffset, string> = { [-1]: "S-1", 0: "S", 1: "S+1" };
const OFFSET_STYLES: Record<WeekOffset, string> = {
  [-1]: "bg-slate-200 text-slate-800",
  0: "bg-emerald-100 text-emerald-900",
  1: "bg-amber-100 text-amber-900",
};

const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const weekRange = (w: ProductionWeek) =>
  `${formatProductionWeek(w)}, du jeudi ${shortDay(w.startDate)} au mercredi ${shortDay(w.endDate)}`;

/** Semaines S-1, S et S+1 autour de la date du jour. */
export function weeksAround(today: string): Record<WeekOffset, ProductionWeek> {
  const current = computeProductionWeek(today);
  return {
    [-1]: computeProductionWeek(addDays(current.startDate, -7)),
    0: current,
    1: computeProductionWeek(addDays(current.startDate, 7)),
  } as Record<WeekOffset, ProductionWeek>;
}

export function WeekLegend({ weeks }: { weeks: Record<WeekOffset, ProductionWeek> }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm">
      <p>
        La semaine de production va du <strong>jeudi au mercredi</strong>. Sur cette page :
      </p>
      <ul className="flex flex-col gap-1">
        {([-1, 0, 1] as const).map((o) => (
          <li key={o} className="flex flex-wrap items-center gap-2">
            <WeekBadge offset={o} />
            <span>
              {o === -1
                ? "semaine qui vient de se terminer"
                : o === 0
                  ? "semaine en cours"
                  : "semaine qui commence jeudi prochain"}{" "}
              — {weekRange(weeks[o])}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-slate-600">
        Le mardi, la semaine en cours (S) n&apos;est pas finie : on prépare S+1. Le jeudi, une nouvelle semaine commence
        : on clôt S-1 et on prépare S+1. Les fichiers sont lus sur cet ordinateur et ne sont pas envoyés : seules les
        données utiles sont enregistrées, après votre validation.
      </p>
    </div>
  );
}

export function WeekBadge({ offset }: { offset: WeekOffset }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${OFFSET_STYLES[offset]}`}>
      {OFFSET_LABELS[offset]}
    </span>
  );
}

/** En-tête d'un jour (« Mardi »), avec ce qu'on y fait. */
export function DayHeader({ id, day, text }: { id: string; day: string; text: string }) {
  return (
    <div id={id} className="mt-2 scroll-mt-4 border-b-2 border-rouge-700 pb-1">
      <h2 className="text-xl font-bold text-rouge-700">{day}</h2>
      <p className="text-sm text-slate-600">{text}</p>
    </div>
  );
}

/** Présentation d'un document à déposer : ce que c'est, la semaine concernée, à quoi il sert. */
export function DocumentIntro({
  title,
  offset,
  weeks,
  weekNote,
  what,
  usedFor,
  notes,
  children,
}: {
  title: string;
  offset: WeekOffset;
  weeks: Record<WeekOffset, ProductionWeek>;
  /** Précision sur la période (« et les semaines d'avant »). */
  weekNote?: string;
  what: string;
  usedFor: string[];
  /** Bon à savoir (ce qui n'est jamais lu, ce qui remplace quoi). */
  notes?: string;
  /** Zone de dépôt du document. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border-l-4 border-brun-700 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{title}</span>
        <WeekBadge offset={offset} />
        <span className="text-sm text-slate-600">
          {formatProductionWeek(weeks[offset])}
          {weekNote ? ` ${weekNote}` : ""}
        </span>
      </div>
      <p className="text-sm">
        <span className="font-medium">Le document : </span>
        {what}
      </p>
      <div className="text-sm">
        <span className="font-medium">À quoi il sert :</span>
        <ul className="list-disc pl-5">
          {usedFor.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </div>
      {notes && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">Bon à savoir : </span>
          {notes}
        </p>
      )}
      {children && <div className="mt-2 border-t border-slate-200 pt-3">{children}</div>}
    </div>
  );
}
