import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { Period } from "@/domain/periodes";
import { RECONCILIATION_STATUS_LABELS, type ReconciliationRow } from "@/domain/rapprochement";
import { requireUser } from "@/modules/auth/next-session";
import { alchimistesReconciliation, canReadReconciliation, type ReconciliationPeriod, weekCollections } from "@/modules/statistiques/alchimistes";
import { anchorWeek } from "@/modules/statistiques/context";
import { adjacentOf } from "@/modules/statistiques/facts";
import { Card, ExportLinks, num, type Params, PeriodNav, pct, Stat, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Alchimistes — Statistiques — Pertes" };

/** Couleurs fixes des deux séries (palette catégorielle validée, dans l'ordre). */
const DECLARED = "#2a78d6";
const MEASURED = "#eb6834";

const kg = (n: number) => `${num.format(n)} kg`;
const gap = (r: ReconciliationRow) => (r.gapKg == null ? "—" : `${r.gapKg > 0 ? "+" : r.gapKg < 0 ? "−" : ""}${kg(Math.abs(r.gapKg))}${r.gapRate != null ? ` (${pct.format(Math.abs(r.gapRate))})` : ""}`);
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Barres appariées déclaré / pesé par période : valeurs écrites, légende au-dessus (jamais la couleur seule). */
function PairBars({ rows, caption }: { rows: ReconciliationPeriod[]; caption: string }) {
  const max = Math.max(0, ...rows.flatMap((r) => [r.declaredKg, r.measuredKg]));
  const bar = (value: number, color: string, label: string) => (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 rounded-r bg-slate-100" aria-hidden>
        {value > 0 && <div className="h-2.5 rounded-r" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />}
      </div>
      <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-700">
        {label} {kg(value)}
      </span>
    </div>
  );
  return (
    <figure className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700" aria-label="Légende">
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: DECLARED }} aria-hidden />
          Déclaré vers Les Alchimistes
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: MEASURED }} aria-hidden />
          Pesé par Les Alchimistes
        </li>
      </ul>
      <ul className="flex flex-col text-sm" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col gap-1 border-t border-slate-100 py-2 first:border-t-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{r.label}</span>
              <span className="text-xs text-slate-600">{r.status === "rapproche" ? `écart ${gap(r)}` : RECONCILIATION_STATUS_LABELS[r.status]}</span>
            </div>
            {bar(r.declaredKg, DECLARED, "déclaré")}
            {r.status !== "sans_fichier" && bar(r.measuredKg, MEASURED, "pesé")}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function PeriodTable({ rows, total, first, caption }: { rows: ReconciliationPeriod[]; total: ReconciliationRow & { periods: number }; first: string; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm [&_td]:px-2 [&_th]:px-2">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-slate-600">
            <th className="py-1 font-medium">{first}</th>
            <th className="py-1 text-right font-medium">Déclaré</th>
            <th className="py-1 text-right font-medium">Pesé</th>
            <th className="py-1 text-right font-medium">Bacs</th>
            <th className="py-1 text-right font-medium">Écart (pesé − déclaré)</th>
            <th className="py-1 pl-3 font-medium">État</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right tabular-nums">{kg(r.declaredKg)}</td>
              <td className="py-1 text-right tabular-nums">{r.status === "sans_fichier" ? "—" : kg(r.measuredKg)}</td>
              <td className="py-1 text-right tabular-nums">{r.status === "sans_fichier" ? "—" : r.bins}</td>
              <td className="py-1 text-right tabular-nums">{gap(r)}</td>
              <td className="py-1 pl-3 text-slate-600">{RECONCILIATION_STATUS_LABELS[r.status]}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 font-semibold">
            <td className="py-1">Total ({total.periods} rapprochée{total.periods > 1 ? "s" : ""})</td>
            <td className="py-1 text-right tabular-nums">{kg(total.declaredKg)}</td>
            <td className="py-1 text-right tabular-nums">{kg(total.measuredKg)}</td>
            <td className="py-1 text-right tabular-nums">{total.bins}</td>
            <td className="py-1 text-right tabular-nums">{gap(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function AlchimistesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadReconciliation(user)) redirect("/");
  const params = await searchParams;
  const base = await statsContext(user, params);
  const anchor = await anchorWeek(db, base);
  if (!anchor) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const ctx = { ...base, period: anchor as Period };
  const [data, previous, next] = await Promise.all([alchimistesReconciliation(db, user, anchor), adjacentOf(db, anchor, -1), adjacentOf(db, anchor, 1)]);
  if (!data) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const current = data.weeks.at(-1)!;
  const bins = await weekCollections(db, user, [current.key]);
  const notConverted = data.weeks.reduce((a, w) => a + w.notConverted, 0);
  const path = "/statistiques/alchimistes";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Rapprochement avec Les Alchimistes — {current.label}</h1>
      <StatsTabs user={user} ctx={ctx} active="alchimistes" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} />
      <p className="text-sm text-slate-600">
        Toute l&apos;entreprise : les pesées des Alchimistes ne se répartissent ni par zone ni par équipe. Le poids pesé est une mesure de contrôle : il ne
        s&apos;ajoute jamais aux pertes déclarées. Un écart n&apos;est pas une erreur : un bac rempli un mercredi peut être collecté le jeudi (semaine
        suivante), et les bacs contiennent aussi ce qui n&apos;est pas déclaré comme perte (épluchures, par exemple).
      </p>
      {!data.destinationName && <p className="rounded-xl bg-amber-50 p-3 text-amber-950">La destination « Les Alchimistes » (code ALCHIMISTES) est introuvable.</p>}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Semaine choisie">
        <Stat label={`Déclaré ${current.label}`} value={kg(current.declaredKg)} change={`${current.declaredLines} ligne${current.declaredLines > 1 ? "s" : ""}`} />
        <Stat label="Pesé" value={current.status === "sans_fichier" ? "—" : kg(current.measuredKg)} change={current.status === "sans_fichier" ? "pesées non déposées" : `${current.bins} bac${current.bins > 1 ? "s" : ""}`} />
        <Stat label="Écart" value={gap(current)} change={RECONCILIATION_STATUS_LABELS[current.status]} />
        <Stat label="12 semaines" value={gap(data.weeksTotal)} change={`${kg(data.weeksTotal.declaredKg)} déclarés, ${kg(data.weeksTotal.measuredKg)} pesés`} />
      </section>

      <Card title="Semaine après semaine">
        <PairBars rows={data.weeks} caption="Kg déclarés et pesés par semaine de production" />
        <PeriodTable rows={data.weeks} total={data.weeksTotal} first="Semaine" caption="Rapprochement par semaine de production" />
        <p className="text-xs text-slate-500">
          Semaine de production (jeudi → mercredi) : date de la perte d&apos;un côté, date de collecte de l&apos;autre. Écart en % : rapporté au poids pesé.
          {notConverted > 0 && ` ${notConverted} ligne${notConverted > 1 ? "s" : ""} déclarée${notConverted > 1 ? "s" : ""} sans poids en kg (non comptée${notConverted > 1 ? "s" : ""}).`}
        </p>
      </Card>

      <Card title="Mois après mois">
        <PeriodTable rows={data.months} total={data.monthsTotal} first="Mois" caption="Rapprochement par mois" />
      </Card>

      <Card title={`Bacs pesés en ${current.label}`}>
        {bins.length === 0 ? (
          <p className="text-slate-600">{current.status === "sans_fichier" ? "Pesées non déposées pour cette semaine." : "Aucune collecte cette semaine."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm [&_td]:px-2 [&_th]:px-2">
              <caption className="sr-only">Bacs pesés de la semaine</caption>
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">N° de bac</th>
                  <th className="py-1 text-right font-medium">Poids</th>
                  <th className="py-1 text-right font-medium">Qualité</th>
                  <th className="py-1 pl-3 font-medium">Incident</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((b, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1">{shortDate(b.date)}</td>
                    <td className="py-1">{b.containerNumber ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{kg(b.kg)}</td>
                    <td className="py-1 text-right tabular-nums">{b.quality ?? "—"}</td>
                    <td className="py-1 pl-3 text-slate-600">{b.incident ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">Le rapprochement bac par bac sera possible quand le fichier des Alchimistes donnera les n° des bacs.</p>
      </Card>
      <ExportLinks tab="alchimistes" ctx={ctx} note="Les 12 semaines et les 12 mois, toute l'entreprise." />
    </div>
  );
}
