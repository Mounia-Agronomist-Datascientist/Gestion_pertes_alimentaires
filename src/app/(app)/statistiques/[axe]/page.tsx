import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import { formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { type Axis, axisDetail, compareAxis } from "@/modules/statistiques/analysis";
import { generalDashboard } from "@/modules/statistiques/dashboard";
import { canReadStats } from "@/modules/statistiques/facts";
import {
  BarTable,
  Card,
  DestinationBars,
  detailOf,
  euro,
  ExportLinks,
  FilterForm,
  isUuid,
  num,
  type Params,
  PeriodNav,
  scopeNote,
  shortTrend,
  StatsTabs,
  type StatsContext,
  statsContext,
  statsHref,
  SummaryNotes,
  SummaryTiles,
} from "../shared";

const AXES: Record<string, { axis: Axis; title: string; one: string }> = {
  zones: { axis: "zone", title: "Pertes par zone", one: "zone" },
  equipes: { axis: "equipe", title: "Pertes par équipe", one: "équipe" },
};

export async function generateMetadata({ params }: { params: Promise<{ axe: string }> }) {
  const { axe } = await params;
  return { title: `${AXES[axe]?.title ?? "Statistiques"} — Pertes` };
}

export default async function AxisPage({ params, searchParams }: { params: Promise<{ axe: string }>; searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const { axe } = await params;
  const config = AXES[axe];
  if (!config) notFound();
  const query = await searchParams;
  const ctx = await statsContext(user, query);
  const path = `/statistiques/${axe}`;
  const id = isUuid(query.id) ? query.id : null;

  if (!id) {
    // Sans le droit de comparer, une équipe va directement au détail de son équipe.
    if (config.axis === "equipe" && !ctx.compareTeams) {
      if (!user.teamId) redirect(statsHref("/statistiques", ctx));
      redirect(statsHref(path, ctx, ctx.period, { id: user.teamId }));
    }
    return <Comparison user={user} ctx={ctx} axe={axe} />;
  }
  if (config.axis === "equipe" && !ctx.compareTeams && id !== user.teamId) notFound();
  return <Detail user={user} ctx={ctx} axe={axe} id={id} />;
}

async function Comparison({ user, ctx, axe }: { user: Awaited<ReturnType<typeof requireUser>>; ctx: StatsContext; axe: string }) {
  const config = AXES[axe]!;
  const path = `/statistiques/${axe}`;
  const [result, nav] = await Promise.all([compareAxis(db, user, config.axis, ctx.period, ctx.filters), generalDashboard(db, user, ctx.period, ctx.filters)]);
  const note = scopeNote(user, ctx.compareTeams);
  const previousLabel = result.previousPeriod ? periodLabel(result.previousPeriod) : null;
  const detailHref = (id: string) => statsHref(path, ctx, ctx.period, { id });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">
        {config.title} — {periodLabel(ctx.period)}
      </h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active={axe === "zones" ? "zones" : "equipes"} />
      <PeriodNav path={path} ctx={ctx} previous={nav.previousPeriod} next={nav.nextPeriod} />
      <FilterForm path={path} ctx={ctx} hideZone={config.axis === "zone"} hideTeam={config.axis === "equipe"} />

      {result.rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600 shadow-sm">Aucune perte sur cette période.</p>
      ) : (
        <>
          <Card title="Kg de pertes alimentaires">
            <BarTable
              caption={`Kg par ${config.one}`}
              rows={result.rows.map((r) => ({
                key: r.id,
                label: r.label,
                href: detailHref(r.id),
                value: r.summary.foodKg,
                text: `${num.format(r.summary.foodKg)} kg`,
                detail: `${detailOf(r.summary)}${previousLabel ? ` · ${shortTrend(r.summary.foodKg, r.previous?.foodKg)} vs ${previousLabel}` : ""}`,
              }))}
            />
          </Card>
          {result.withCosts && (
            <Card title="Coût brut">
              <BarTable
                caption={`Coût brut par ${config.one}`}
                rows={result.rows.map((r) => ({
                  key: r.id,
                  label: r.label,
                  href: detailHref(r.id),
                  value: r.summary.cost?.grossEur ?? 0,
                  text: euro.format(r.summary.cost?.grossEur ?? 0),
                  detail: `net ${euro.format(r.summary.cost?.netEur ?? 0)}${previousLabel ? ` · ${shortTrend(r.summary.cost?.grossEur ?? 0, r.previous?.cost?.grossEur)} vs ${previousLabel}` : ""}`,
                }))}
              />
            </Card>
          )}
          {result.withoutTeam > 0 && (
            <p className="text-sm text-slate-600">
              {result.withoutTeam} perte{result.withoutTeam > 1 ? "s" : ""} sans équipe (attribuée{result.withoutTeam > 1 ? "s" : ""} à une zone) : voir « Par zone ».
            </p>
          )}
          <ExportLinks tab={axe} ctx={ctx} />
        </>
      )}
    </div>
  );
}

async function Detail({ user, ctx, axe, id }: { user: Awaited<ReturnType<typeof requireUser>>; ctx: StatsContext; axe: string; id: string }) {
  const config = AXES[axe]!;
  const path = `/statistiques/${axe}`;
  const scoped = { ...ctx.filters, ...(config.axis === "zone" ? { zoneId: id } : { teamId: id }) };
  const [detail, dashboard] = await Promise.all([axisDetail(db, user, config.axis, id, ctx.period, ctx.filters), generalDashboard(db, user, ctx.period, scoped)]);
  if (!detail.label) notFound();
  const { withCosts } = detail;
  const rank = <T extends { key: string; label: string; summary: Parameters<typeof detailOf>[0] }>(rows: T[], limit: number, sub?: (r: T) => string) =>
    rows.slice(0, limit).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.summary.foodKg,
      text: `${num.format(r.summary.foodKg)} kg`,
      detail: [sub?.(r), detailOf(r.summary)].filter(Boolean).join(" · "),
    }));
  const keep = { id };

  return (
    <div className="flex flex-col gap-4">
      <Link href={ctx.compareTeams || config.axis === "zone" ? statsHref(path, ctx) : statsHref("/statistiques", ctx)} className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← {ctx.compareTeams || config.axis === "zone" ? config.title : "Statistiques"}
      </Link>
      <h1 className="text-2xl font-bold">
        {detail.label} — {periodLabel(ctx.period)}
      </h1>
      <StatsTabs user={user} ctx={ctx} active={axe === "zones" ? "zones" : "equipes"} />
      <PeriodNav path={path} ctx={ctx} previous={dashboard.previousPeriod} next={dashboard.nextPeriod} extra={keep} />
      <FilterForm path={path} ctx={ctx} keep={keep} hideZone={config.axis === "zone"} hideTeam={config.axis === "equipe"} />

      <SummaryTiles current={dashboard.current} previous={dashboard.previous} previousLabel={dashboard.previousPeriod ? periodLabel(dashboard.previousPeriod) : null} withCosts={withCosts} />
      <SummaryNotes summary={dashboard.current} withCosts={withCosts} />

      {detail.summary.events === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600 shadow-sm">Aucune perte sur cette période.</p>
      ) : (
        <>
          <Card title="Causes principales">
            <BarTable caption="Kg par cause" rows={rank(detail.causes, 5)} />
            {detail.causes.length > 5 && <p className="text-xs text-slate-500">5 premières causes sur {detail.causes.length} (en kg).</p>}
          </Card>
          <Card title="Produits concernés">
            <BarTable caption="Kg par produit" rows={rank(detail.products, 10, (p) => PRODUCT_CATEGORY_LABELS[p.category as keyof typeof PRODUCT_CATEGORY_LABELS] ?? p.category)} />
            {detail.products.length > 10 && <p className="text-xs text-slate-500">10 premiers produits sur {detail.products.length} (en kg).</p>}
          </Card>
          <Card title="Par sous-zone">
            <BarTable caption="Kg par sous-zone" rows={rank(detail.subzones, 20)} />
          </Card>
          {detail.teams.length > 0 && (
            <Card title="Par équipe">
              <BarTable caption="Kg par équipe" rows={rank(detail.teams, 20).map((r) => ({ ...r, href: statsHref("/statistiques/equipes", ctx, ctx.period, { id: r.key }) }))} />
            </Card>
          )}
          <Card title="Devenir des pertes alimentaires">
            <DestinationBars summary={detail.summary} />
          </Card>
        </>
      )}

      {detail.weeks.length > 1 && (
        <Card title="Semaine après semaine">
          <BarTable
            caption="Kg par semaine de production"
            showShare={false}
            rows={detail.weeks.map((w) => ({
              key: `${w.year}-${w.number}`,
              label: formatProductionWeek(w),
              value: w.summary.foodKg,
              text: `${num.format(w.summary.foodKg)} kg`,
              detail: detailOf(w.summary),
            }))}
          />
          <p className="text-xs text-slate-500">Les {detail.weeks.length} dernières semaines de production jusqu&apos;à la fin de la période, avec les mêmes filtres.</p>
        </Card>
      )}
      <ExportLinks tab={axe} ctx={ctx} keep={keep} />
    </div>
  );
}
