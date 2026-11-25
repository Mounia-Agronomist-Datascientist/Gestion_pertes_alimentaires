import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import { zoneNameWithoutNumber } from "@/domain/nom-zone";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { zoneTargetProgress } from "@/modules/objectifs";
import { Card, FilterForm, num, type Params, PeriodNav, scopeNote, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Objectifs — Statistiques — Pertes" };

const kg = (n: number) => `${num.format(n)} kg`;

/**
 * Objectifs par zone (décision du 26/11/2026) : kg perdus de la semaine face à l'objectif, écart, et progrès sur les
 * dernières semaines.
 */
export default async function TargetsStatsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const ctx = await statsContext(user, await searchParams);
  // Les objectifs se suivent à la semaine : une autre période prend la semaine en cours.
  const week =
    ctx.period.kind === "semaine"
      ? ctx.period
      : await findStoredProductionWeek(db, ctx.today).then((w) =>
          w ? { kind: "semaine" as const, year: w.year, number: w.number } : null,
        );
  const weekCtx = week ? { ...ctx, period: week } : ctx;
  const [progress, previous, next] = await Promise.all([
    week ? zoneTargetProgress(db, user, week, ctx.filters) : null,
    adjacentOf(db, weekCtx.period, -1),
    adjacentOf(db, weekCtx.period, 1),
  ]);
  const path = "/statistiques/objectifs";
  const note = scopeNote(user, ctx.compareTeams);
  const rows = progress?.zones ?? [];
  const current = (z: (typeof rows)[number]) => z.weeks[z.weeks.length - 1]!;
  const before = (z: (typeof rows)[number]) => z.weeks[z.weeks.length - 2] ?? null;
  const withTarget = rows.filter((z) => current(z).target != null);
  const met = withTarget.filter((z) => current(z).kg <= current(z).target!);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Objectifs — {periodLabel(weekCtx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={weekCtx} active="objectifs" />
      <PeriodNav path={path} ctx={weekCtx} previous={previous} next={next} />
      <FilterForm path={path} ctx={weekCtx} />
      {ctx.period.kind !== "semaine" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Les objectifs se suivent à la semaine : semaine en cours affichée.
        </p>
      )}

      {withTarget.length === 0 ? (
        <Card title="Aucun objectif">
          <p className="text-slate-600">
            Aucune zone n&apos;a encore d&apos;objectif.
            {can(user, "referentiel.manage") && (
              <>
                {" "}
                <Link href="/admin/objectifs" className="font-medium text-rouge-700 underline">
                  Fixer les objectifs par zone
                </Link>
              </>
            )}
          </p>
        </Card>
      ) : (
        <p className="text-lg font-semibold">
          {met.length} zone{met.length > 1 ? "s" : ""} sur {withTarget.length} dans l&apos;objectif cette semaine
        </p>
      )}

      <section className="flex flex-col gap-2">
        {rows.map((z) => {
          const c = current(z);
          const b = before(z);
          const gap = c.target != null ? Math.round((c.kg - c.target) * 10) / 10 : null;
          const change = b ? Math.round((c.kg - b.kg) * 10) / 10 : null;
          const max = Math.max(1, ...z.weeks.map((w) => Math.max(w.kg, w.target ?? 0)));
          return (
            <article key={z.zoneId} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{zoneNameWithoutNumber(z.name)}</h2>
                <span className="text-xl font-bold tabular-nums">{kg(c.kg)}</span>
              </div>
              <p className="text-sm">
                {c.target == null ? (
                  <span className="text-slate-600">Pas d&apos;objectif pour cette semaine</span>
                ) : gap! <= 0 ? (
                  <span className="font-medium text-emerald-800">
                    ✓ Dans l&apos;objectif ({kg(c.target)} au plus) : {kg(-gap!)} de marge
                  </span>
                ) : (
                  <span className="font-medium text-amber-800">
                    ✗ Au-dessus de l&apos;objectif ({kg(c.target)} au plus) : +{kg(gap!)}
                    {c.target > 0 ? ` (+${num.format(Math.round((gap! / c.target) * 100))} %)` : ""}
                  </span>
                )}
                {change != null && b && (
                  <span className="text-slate-600">
                    {" "}
                    · {change < 0
                      ? `▼ ${kg(-change)} de moins`
                      : change > 0
                        ? `▲ ${kg(change)} de plus`
                        : "= autant"}{" "}
                    qu&apos;en {b.label}
                  </span>
                )}
              </p>
              <div
                className="grid items-end gap-1"
                style={{ gridTemplateColumns: `repeat(${z.weeks.length}, minmax(0, 1fr))` }}
                role="img"
                aria-label={`Kg perdus par semaine : ${z.weeks
                  .map(
                    (w) =>
                      `${w.label} ${num.format(w.kg)} kg${w.target != null ? ` (objectif ${num.format(w.target)})` : ""}`,
                  )
                  .join(", ")}`}
              >
                {z.weeks.map((w) => {
                  const over = w.target != null && w.kg > w.target;
                  return (
                    <div key={w.id} className="flex flex-col items-center gap-1" title={`${w.label} : ${kg(w.kg)}`}>
                      <div className="relative flex h-20 w-full items-end justify-center">
                        {w.target != null && (
                          <div
                            className="absolute right-0 left-0 border-t-2 border-dashed border-slate-500"
                            style={{ bottom: `${(w.target / max) * 100}%` }}
                          />
                        )}
                        <div
                          className={`w-3/5 rounded-t ${over ? "bg-rouge-500" : "bg-brun-700"}`}
                          style={{ height: `${Math.max(2, (w.kg / max) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 tabular-nums">{w.label}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
      <p className="text-xs text-slate-500">
        Barres : kg de pertes alimentaires de chaque semaine (en rouge au-dessus de l&apos;objectif) ; pointillés :
        objectif en vigueur. Retours fournisseur non comptés. Objectifs : Administration → Objectifs par zone.
      </p>
    </div>
  );
}
