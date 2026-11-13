import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import { can } from "@/modules/auth/permissions";
import { requireUser } from "@/modules/auth/next-session";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { anchorWeek } from "@/modules/statistiques/context";
import { DESTINATION_KIND_STATS } from "@/modules/statistiques/dashboard";
import { type Co2Group, environmentDashboard } from "@/modules/statistiques/environnement";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { StackedColumnChart } from "../evolution/stacked-chart";
import { BarTable, Card, ExportLinks, FilterForm, num, type Params, PeriodNav, pct, scopeNote, Stat, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Environnement — Statistiques — Pertes" };

/** Couleurs fixes : mesuré, estimé, non couvert (palette catégorielle validée, dans l'ordre ; gris pour « non couvert »). */
const COLORS = { mesure: "#2a78d6", estime: "#eb6834", non_couvert: "#cbd5e1" } as const;
const METHOD_LABELS = { mesure: "Mesuré (recette Melba)", estime: "Estimé (hors liste, par famille)", non_couvert: "Non couvert" } as const;

/** kg CO2e, ou tonnes au-delà d'une tonne. */
export const co2 = (kg: number) => (kg >= 1000 ? `${num.format(kg / 1000)} t CO2e` : `${num.format(kg)} kg CO2e`);
const kgOf = (g: Co2Group) => g.summary.kg.mesure + g.summary.kg.estime + g.summary.kg.non_couvert;
const categoryLabel = (c: string) => PRODUCT_CATEGORY_LABELS[c as keyof typeof PRODUCT_CATEGORY_LABELS] ?? c;
const kindLabel = (k: string) => DESTINATION_KIND_STATS.find((d) => d.kind === k)?.label ?? k;

function Co2Bars({ groups, caption }: { groups: Co2Group[]; caption: string }) {
  return (
    <BarTable
      caption={caption}
      rows={groups.map((g) => ({
        key: g.key,
        label: g.label,
        value: g.summary.co2eKg,
        text: co2(g.summary.co2eKg),
        detail: [`${num.format(kgOf(g))} kg perdus`, g.summary.kg.non_couvert > 0 ? `dont ${num.format(g.summary.kg.non_couvert)} kg non couverts` : null].filter(Boolean).join(" · "),
      }))}
    />
  );
}

export default async function EnvironmentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const ctx = await statsContext(user, params);
  const anchor = await anchorWeek(db, ctx);
  const [data, previous, next] = await Promise.all([
    environmentDashboard(db, user, ctx.period, anchor, ctx.filters, { category: categoryLabel, destinationKind: kindLabel }),
    adjacentOf(db, ctx.period, -1),
    adjacentOf(db, ctx.period, 1),
  ]);
  const path = "/statistiques/environnement";
  const note = scopeNote(user, ctx.compareTeams);
  const { summary } = data;
  const foodKg = summary.kg.mesure + summary.kg.estime + summary.kg.non_couvert;
  const share = (kg: number) => (foodKg > 0 ? pct.format(kg / foodKg) : "—");
  const weekLabel = (n: number) => `S${String(n).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Environnement — {periodLabel(ctx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="environnement" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} />
      <FilterForm path={path} ctx={ctx} />
      <p className="text-sm text-slate-600">
        Impact carbone de la production des denrées perdues, jusqu&apos;à leur livraison (Agribalyse 3.2, facteurs validés). Ce n&apos;est pas le bilan carbone
        de l&apos;entreprise. Les emballages et moules ne sont pas comptés.
      </p>
      {data.validFactors === 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-amber-950">
          Aucun facteur d&apos;émission validé : tout est « non couvert ».{" "}
          {can(user, "referentiel.manage") ? (
            <Link href="/admin/facteurs-co2" className="underline">
              Valider les facteurs
            </Link>
          ) : (
            "Les facteurs doivent être validés par l'administration."
          )}
        </p>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Indicateurs principaux">
        <Stat label="Impact CO2e" value={co2(summary.co2eKg)} change={summary.co2ByMethod.estime > 0 ? `dont ${co2(summary.co2ByMethod.estime)} estimés` : null} />
        <Stat label="Kg mesurés" value={`${num.format(summary.kg.mesure)} kg`} change={`${share(summary.kg.mesure)} des kg perdus`} />
        <Stat label="Kg estimés" value={`${num.format(summary.kg.estime)} kg`} change={`${share(summary.kg.estime)} des kg perdus`} />
        <Stat label="Kg non couverts" value={`${num.format(summary.kg.non_couvert)} kg`} change={`${share(summary.kg.non_couvert)} des kg perdus`} />
      </section>

      <Card title="Couverture des kg perdus">
        {foodKg === 0 ? (
          <p className="text-slate-600">Aucune perte alimentaire pesée sur cette période.</p>
        ) : (
          <figure className="flex flex-col gap-2">
            <div className="flex h-4 gap-0.5 overflow-hidden rounded" role="img" aria-label="Part des kg mesurés, estimés et non couverts">
              {(["mesure", "estime", "non_couvert"] as const)
                .filter((m) => summary.kg[m] > 0)
                .map((m) => (
                  <div key={m} style={{ width: `${(summary.kg[m] / foodKg) * 100}%`, backgroundColor: COLORS[m] }} />
                ))}
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {(["mesure", "estime", "non_couvert"] as const).map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <span className="inline-block size-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[m] }} aria-hidden />
                  <span className="flex-1">{METHOD_LABELS[m]}</span>
                  <span className="tabular-nums">
                    {num.format(summary.kg[m])} kg · {share(summary.kg[m])}
                  </span>
                </li>
              ))}
            </ul>
          </figure>
        )}
        <ul className="flex flex-col gap-1 text-xs text-slate-500">
          <li>Mesuré : CO2e calculé à partir de la recette Melba et des facteurs de chaque ingrédient.</li>
          <li>Estimé : perte hors liste, à partir de la famille de son libellé.</li>
          <li>Non couvert : ingrédients sans famille ou sans facteur validé (épices, fonds…), jamais estimés.</li>
          {summary.withoutKg > 0 && <li>{summary.withoutKg} perte{summary.withoutKg > 1 ? "s" : ""} sans poids en kg (comptées en CO2e si leur nombre de portions est connu).</li>}
          {data.nonFood > 0 && <li>{data.nonFood} perte{data.nonFood > 1 ? "s" : ""} d&apos;emballages ou de moules non comptées.</li>}
        </ul>
      </Card>

      {data.byCategory.length > 0 && (
        <Card title="Par catégorie de produit">
          <Co2Bars groups={data.byCategory} caption="CO2e par catégorie de produit" />
        </Card>
      )}
      {data.byDestination.length > 0 && (
        <Card title="Par devenir">
          <Co2Bars groups={data.byDestination} caption="CO2e par devenir" />
          <p className="text-xs text-slate-500">Une perte répartie entre plusieurs destinations est partagée au prorata des quantités.</p>
        </Card>
      )}
      {data.byProduct.length > 0 && (
        <Card title="Produits qui pèsent le plus">
          <Co2Bars groups={data.byProduct} caption="CO2e par produit" />
        </Card>
      )}

      {data.series.length > 0 && (
        <Card title="Semaine après semaine">
          <StackedColumnChart
            caption="CO2e des pertes par semaine, mesuré et estimé"
            format={co2}
            segments={[
              { key: "mesure", label: "Mesuré", color: COLORS.mesure },
              { key: "estime", label: "Estimé", color: COLORS.estime },
            ]}
            columns={data.series.map((w) => ({
              key: w.id,
              label: weekLabel(w.number),
              values: { mesure: w.summary.co2ByMethod.mesure, estime: w.summary.co2ByMethod.estime },
              total: w.summary.co2eKg,
              text: co2(w.summary.co2eKg),
              highlight: w.number === anchor?.number && w.year === anchor?.year,
            }))}
          />
          <p className="text-xs text-slate-500">12 dernières semaines de production, avec les mêmes filtres.</p>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        Chaque perte prend la version du facteur en vigueur à sa date (la première version validée pour les pertes plus anciennes) : une nouvelle valeur
        ne change pas l&apos;impact des pertes passées.
      </p>
      <ExportLinks tab="environnement" ctx={ctx} />
    </div>
  );
}
