import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import type { RankBy } from "@/domain/statistiques";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { PRODUCT_TYPES, type ProductType, productRanking, RANK_BY_LABELS } from "@/modules/statistiques/rankings";
import { BarTable, Card, euro, FilterForm, num, OptionChips, type Params, PeriodNav, pct, scopeNote, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Produits — Statistiques — Pertes" };

const LIMIT = 20;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const ctx = await statsContext(user, params);
  const type: ProductType = params.type && params.type in PRODUCT_TYPES ? (params.type as ProductType) : "plats";
  const by: RankBy = params.tri === "cout" && can(user, "indicators.read") ? "cout" : params.tri === "evenements" ? "evenements" : "kg";
  const [ranking, previous, next] = await Promise.all([productRanking(db, user, ctx.period, ctx.filters, type, by), adjacentOf(db, ctx.period, -1), adjacentOf(db, ctx.period, 1)]);
  const keep = { type, tri: by };
  const path = "/statistiques/produits";
  const note = scopeNote(user, ctx.compareTeams);
  const value = (r: (typeof ranking.rows)[number]) => (by === "kg" ? r.summary.foodKg : by === "cout" ? (r.summary.cost?.grossEur ?? 0) : r.summary.events);
  const text = (r: (typeof ranking.rows)[number]) =>
    by === "kg" ? `${num.format(r.summary.foodKg)} kg` : by === "cout" ? euro.format(r.summary.cost?.grossEur ?? 0) : `${r.summary.events} perte${r.summary.events > 1 ? "s" : ""}`;
  const detail = (r: (typeof ranking.rows)[number]) =>
    [
      type === "tous" || type === "autres" ? PRODUCT_CATEGORY_LABELS[r.category as keyof typeof PRODUCT_CATEGORY_LABELS] : null,
      by !== "evenements" ? `${r.summary.events} perte${r.summary.events > 1 ? "s" : ""}` : null,
      by !== "kg" && r.summary.foodKg > 0 ? `${num.format(r.summary.foodKg)} kg` : null,
      r.summary.barquettes > 0 ? `${num.format(r.summary.barquettes)} barquette${r.summary.barquettes > 1 ? "s" : ""}` : null,
      by !== "cout" && r.summary.cost ? euro.format(r.summary.cost.grossEur) : null,
      r.mainCause ? `cause principale : ${r.mainCause.name} (${pct.format(r.mainCause.share)})` : null,
      r.usedIn?.length ? `sert à ${r.usedIn.length} plat${r.usedIn.length > 1 ? "s" : ""} : ${r.usedIn.join(", ")}` : null,
      r.names.length ? `plats de la formule : ${r.names.join(" ; ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Produits — {periodLabel(ctx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="produits" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} extra={keep} />
      <FilterForm path={path} ctx={ctx} keep={keep} />
      <OptionChips label="Produits" path={path} ctx={ctx} name="type" value={type} keep={keep} options={Object.entries(PRODUCT_TYPES).map(([k, v]) => ({ value: k as ProductType, label: v.label }))} />
      <OptionChips
        label="Classer"
        path={path}
        ctx={ctx}
        name="tri"
        value={by}
        keep={keep}
        options={(Object.keys(RANK_BY_LABELS) as RankBy[]).filter((k) => k !== "cout" || ranking.withCosts).map((k) => ({ value: k, label: RANK_BY_LABELS[k] }))}
      />

      <Card title={`${type === "tous" ? "Produits" : PRODUCT_TYPES[type].label} générant le plus de pertes`}>
        {ranking.rows.length === 0 ? (
          <p className="text-slate-600">Aucune perte sur cette période.</p>
        ) : (
          <>
            <BarTable caption="Classement des produits" rows={ranking.rows.slice(0, LIMIT).map((r) => ({ key: r.key, label: r.label, value: value(r), text: text(r), detail: detail(r) }))} />
            {ranking.rows.length > LIMIT && <p className="text-xs text-slate-500">{LIMIT} premiers sur {ranking.rows.length}.</p>}
          </>
        )}
      </Card>
      <p className="text-sm text-slate-500">
        Un plat est suivi par sa formule (code Melba) ; une sous-recette, sans code Melba, par son nom (identification au mieux d&apos;une semaine à
        l&apos;autre) et comptée une seule fois même si elle sert à plusieurs plats. Les pertes par quantité produite arriveront avec les ratios
        (étape 4.6).
      </p>
    </div>
  );
}
