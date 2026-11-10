import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { addDays, formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { COST_COMPONENTS, type CostTotals, weekCostSummary } from "@/modules/couts/summary";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";

export const metadata = { title: "Coûts — Pertes" };

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

/** Couleurs fixes par composante (palette catégorielle validée, ordre fixe : jamais réattribuées). */
const COMPONENT_COLORS: Record<(typeof COST_COMPONENTS)[number]["key"], string> = {
  materialEur: "#2a78d6",
  labourEur: "#eb6834",
  packagingEur: "#1baf7a",
  indirectEur: "#eda100",
};

const COMPONENT_NOTES: Partial<Record<(typeof COST_COMPONENTS)[number]["key"], string>> = {
  labourEur: "non imputée : méthode à définir",
  indirectEur: "prévues dans une version ultérieure",
};

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const user = await requireUser();
  if (!can(user, "indicators.read")) redirect("/");
  const { jour } = await searchParams;
  const today = toProductionLocalDate(new Date());
  const week = await findStoredProductionWeek(db, jour && /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : today);
  if (!week) return <p className="rounded-xl bg-red-50 p-3 text-red-800">Semaine absente du calendrier.</p>;
  const summary = await weekCostSummary(db, user, week.id);
  const { totals } = summary;
  const chip = "rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Coûts des pertes — {formatProductionWeek(week)}</h1>
      <nav className="flex flex-wrap gap-2">
        <Link className={chip} href={`/couts?jour=${addDays(week.startDate, -7)}`}>
          ← Précédente
        </Link>
        <Link className={chip} href="/couts">
          Semaine en cours
        </Link>
        <Link className={chip} href={`/couts?jour=${addDays(week.startDate, 7)}`}>
          Suivante →
        </Link>
      </nav>

      <section className="grid gap-2 sm:grid-cols-3" aria-label="Totaux de la semaine">
        <Stat label="Coût brut" value={euro.format(totals.grossEur)} />
        <Stat label="Recettes encaissées" value={totals.recoveredEur ? `− ${euro.format(totals.recoveredEur)}` : euro.format(0)} />
        <Stat label="Coût net" value={euro.format(totals.netEur)} strong />
      </section>
      <p className="text-sm text-slate-600">
        {summary.declarations} perte{summary.declarations > 1 ? "s" : ""} déclarée{summary.declarations > 1 ? "s" : ""} (
        {summary.netKg.toLocaleString("fr-FR")} kg), dont {summary.valued} valorisée{summary.valued > 1 ? "s" : ""}.
        {summary.notValued > 0 &&
          ` ${summary.notValued} sans coût connu (produit hors liste ou du référentiel) : non comptée${summary.notValued > 1 ? "s" : ""}, jamais estimée${summary.notValued > 1 ? "s" : ""}.`}
        {summary.packagingIncomplete > 0 && ` Emballages incomplets pour ${summary.packagingIncomplete} perte${summary.packagingIncomplete > 1 ? "s" : ""} (prix manquant à la date).`}
      </p>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Répartition du coût brut</h2>
        {totals.grossEur > 0 ? <Breakdown totals={totals} /> : <p className="text-slate-600">Aucun coût cette semaine.</p>}
      </section>

      {summary.byTeam.length > 0 && (
        <CostTable
          title="Par équipe (cuisine)"
          rows={summary.byTeam.map((t) => ({ id: t.id, label: `Équipe ${t.letter} – ${t.colorName}`, totals: t }))}
        />
      )}
      {summary.byZone.length > 0 && <CostTable title="Par zone" rows={summary.byZone.map((z) => ({ id: z.id, label: z.name, totals: z }))} />}
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`text-2xl ${strong ? "font-bold" : "font-semibold"}`}>{value}</p>
    </div>
  );
}

/** Barre empilée à 100 % (part de chaque composante) + légende avec montants et pourcentages. */
function Breakdown({ totals }: { totals: CostTotals }) {
  const parts = COST_COMPONENTS.map((c) => ({ ...c, value: totals[c.key], share: totals[c.key] / totals.grossEur }));
  return (
    <>
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded" role="img" aria-label="Répartition du coût brut par composante">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.key}
              className="h-full first:rounded-l last:rounded-r"
              style={{ width: `${p.share * 100}%`, backgroundColor: COMPONENT_COLORS[p.key] }}
              title={`${p.label} : ${euro.format(p.value)} (${pct.format(p.share)})`}
            />
          ))}
      </div>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Composante</th>
            <th>Montant</th>
            <th>Part</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.key} className="border-t border-slate-100">
              <td className="py-2">
                <span className="mr-2 inline-block size-3 rounded-sm align-middle" style={{ backgroundColor: COMPONENT_COLORS[p.key] }} aria-hidden />
                {p.label}
                {COMPONENT_NOTES[p.key] && <span className="block pl-5 text-xs text-slate-500">{COMPONENT_NOTES[p.key]}</span>}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap">{euro.format(p.value)}</td>
              <td className="w-16 py-2 pl-3 text-right tabular-nums whitespace-nowrap text-slate-600">{pct.format(p.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CostTable({ title, rows }: { title: string; rows: { id: string; label: string; totals: CostTotals }[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-medium" />
              <th className="py-1 text-right font-medium">Brut</th>
              <th className="py-1 text-right font-medium">Recettes</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right tabular-nums">{euro.format(r.totals.grossEur)}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{r.totals.recoveredEur ? `− ${euro.format(r.totals.recoveredEur)}` : "—"}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{euro.format(r.totals.netEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
