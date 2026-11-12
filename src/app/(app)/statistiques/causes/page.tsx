import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import type { RankBy } from "@/domain/statistiques";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { causeAndDestinationRanking, RANK_BY_LABELS } from "@/modules/statistiques/rankings";
import { BarTable, Card, euro, FilterForm, num, OptionChips, type Params, PeriodNav, scopeNote, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Causes et destinations — Statistiques — Pertes" };

export default async function CausesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const ctx = await statsContext(user, params);
  const by: RankBy = params.tri === "cout" && can(user, "indicators.read") ? "cout" : params.tri === "evenements" ? "evenements" : "kg";
  const [ranking, previous, next] = await Promise.all([causeAndDestinationRanking(db, user, ctx.period, ctx.filters, by), adjacentOf(db, ctx.period, -1), adjacentOf(db, ctx.period, 1)]);
  const keep = { tri: by };
  const path = "/statistiques/causes";
  const note = scopeNote(user, ctx.compareTeams);
  const plural = (n: number) => `${n} perte${n > 1 ? "s" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Causes et destinations — {periodLabel(ctx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="causes" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} extra={keep} />
      <FilterForm path={path} ctx={ctx} keep={keep} />
      <OptionChips
        label="Classer"
        path={path}
        ctx={ctx}
        name="tri"
        value={by}
        keep={keep}
        options={(Object.keys(RANK_BY_LABELS) as RankBy[]).filter((k) => k !== "cout" || ranking.withCosts).map((k) => ({ value: k, label: RANK_BY_LABELS[k] }))}
      />

      <Card title="Causes des pertes">
        {ranking.causes.length === 0 ? (
          <p className="text-slate-600">Aucune perte sur cette période.</p>
        ) : (
          <BarTable
            caption="Classement des causes"
            rows={ranking.causes.map((c) => ({
              key: c.key,
              label: c.label,
              value: by === "kg" ? c.summary.foodKg : by === "cout" ? (c.summary.cost?.grossEur ?? 0) : c.summary.events,
              text: by === "kg" ? `${num.format(c.summary.foodKg)} kg` : by === "cout" ? euro.format(c.summary.cost?.grossEur ?? 0) : plural(c.summary.events),
              detail: [
                by !== "evenements" ? plural(c.summary.events) : null,
                by !== "kg" && c.summary.foodKg > 0 ? `${num.format(c.summary.foodKg)} kg` : null,
                by !== "cout" && c.summary.cost ? euro.format(c.summary.cost.grossEur) : null,
                c.mainZone ? `surtout en ${c.mainZone}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        )}
        <p className="text-xs text-slate-500">Les causes en tête de classement sont celles qui méritent en priorité une action corrective.</p>
      </Card>

      <Card title="Destinations">
        {ranking.destinations.length === 0 ? (
          <p className="text-slate-600">Aucune destination sur cette période.</p>
        ) : (
          <BarTable
            caption="Kg par destination"
            rows={ranking.destinations.map((d) => ({ key: d.id, label: d.name, value: d.foodKg, text: `${num.format(d.foodKg)} kg`, detail: plural(d.events) }))}
          />
        )}
        <p className="text-xs text-slate-500">
          Une perte répartie entre plusieurs destinations compte dans chacune. Les emballages et moules n&apos;entrent pas dans les kg.
        </p>
      </Card>
    </div>
  );
}
