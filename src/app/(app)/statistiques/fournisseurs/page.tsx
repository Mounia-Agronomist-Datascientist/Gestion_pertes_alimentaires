import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import type { RankBy } from "@/domain/statistiques";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { supplierReport } from "@/modules/statistiques/fournisseurs";
import { RANK_BY_LABELS } from "@/modules/statistiques/rankings";
import {
  BarTable,
  Card,
  euro,
  FilterForm,
  num,
  OptionChips,
  type Params,
  PeriodNav,
  pct,
  scopeNote,
  StatsTabs,
  statsContext,
} from "../shared";

export const metadata = { title: "Fournisseurs — Statistiques — Pertes" };

const plural = (n: number) => `${n} perte${n > 1 ? "s" : ""}`;

/** Bilan par fournisseur (décision du 26/11/2026) : pertes de la Réception et du Stockage, retours fournisseur. */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const ctx = await statsContext(user, params);
  const by: RankBy =
    params.tri === "cout" && can(user, "indicators.read") ? "cout" : params.tri === "evenements" ? "evenements" : "kg";
  const [report, previous, next] = await Promise.all([
    supplierReport(db, user, ctx.period, ctx.filters, by),
    adjacentOf(db, ctx.period, -1),
    adjacentOf(db, ctx.period, 1),
  ]);
  const keep = { tri: by };
  const path = "/statistiques/fournisseurs";
  const note = scopeNote(user, ctx.compareTeams);
  const valueOf = (r: (typeof report.rows)[number]) =>
    by === "kg" ? r.summary.foodKg : by === "cout" ? (r.summary.cost?.grossEur ?? 0) : r.summary.events;
  const textOf = (r: (typeof report.rows)[number]) =>
    by === "kg"
      ? `${num.format(r.summary.foodKg)} kg`
      : by === "cout"
        ? euro.format(r.summary.cost?.grossEur ?? 0)
        : plural(r.summary.events);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Fournisseurs — {periodLabel(ctx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="fournisseurs" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} extra={keep} />
      <FilterForm path={path} ctx={ctx} keep={keep} />
      <OptionChips
        label="Classer"
        path={path}
        ctx={ctx}
        name="tri"
        value={by}
        keep={keep}
        options={(Object.keys(RANK_BY_LABELS) as RankBy[])
          .filter((k) => k !== "cout" || report.withCosts)
          .map((k) => ({ value: k, label: RANK_BY_LABELS[k] }))}
      />
      <Card title="Pertes de la Réception et du Stockage, par fournisseur">
        {report.rows.length === 0 ? (
          <p className="text-slate-600">Aucune perte en Réception ou en Stockage sur cette période.</p>
        ) : (
          <BarTable
            caption="Pertes par fournisseur"
            rows={report.rows.map((r) => ({
              key: r.key,
              label: r.name,
              value: valueOf(r),
              text: textOf(r),
              detail: [
                [
                  r.receptionKg > 0 ? `Réception ${num.format(r.receptionKg)} kg` : null,
                  r.storageKg > 0 ? `Stockage ${num.format(r.storageKg)} kg` : null,
                  by !== "evenements" ? plural(r.summary.events) : null,
                  by !== "cout" && r.summary.cost ? euro.format(r.summary.cost.grossEur) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
                r.supplierCauseShare != null
                  ? `${pct.format(r.supplierCauseShare)} dues au fournisseur ou à la matière`
                  : null,
                r.returns
                  ? `Retours : ${num.format(r.returns.kg)} kg${
                      r.returns.grossEur != null ? ` · ${euro.format(r.returns.grossEur)}` : ""
                    } (avoir attendu)`
                  : null,
                r.topCauses.length ? `Causes : ${r.topCauses.map((c) => `${c.label} (${c.events})`).join(", ")}` : null,
                r.topProducts.length
                  ? `Produits : ${r.topProducts.map((c) => `${c.label} (${c.events})`).join(", ")}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n"),
            }))}
          />
        )}
        <p className="text-xs text-slate-500">
          Fournisseur d&apos;une perte : celui du colis choisi à la saisie, sinon le dernier fournisseur livré avant la
          perte (bons de commande). « Dues au fournisseur » : causes de la famille « Fournisseur / matière première »
          (Administration → Causes). Les retours fournisseur ne sont pas comptés dans les pertes.
        </p>
      </Card>
    </div>
  );
}
