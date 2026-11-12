import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { periodLabel } from "@/domain/periodes";
import { RECOVERY_GROUPS, type RecoveryGroup, type RecoveryTotals, recoveredShare, recoveryPerKg } from "@/domain/valorisation";
import { requireUser } from "@/modules/auth/next-session";
import { anchorWeek } from "@/modules/statistiques/context";
import { adjacentOf, canReadStats } from "@/modules/statistiques/facts";
import { recoveryDashboard } from "@/modules/statistiques/valorisation";
import { ColumnChart } from "../evolution/column-chart";
import { StackedColumnChart } from "../evolution/stacked-chart";
import { BarTable, Card, euro, ExportLinks, FilterForm, num, type Params, PeriodNav, pct, scopeNote, Stat, StatsTabs, statsContext } from "../shared";

export const metadata = { title: "Valorisation — Statistiques — Pertes" };

/** Couleurs fixes des trois groupes (palette catégorielle validée, dans l'ordre : jamais réattribuées). */
const GROUP_COLORS: Record<RecoveryGroup, string> = { avec_recette: "#2a78d6", sans_recette: "#eb6834", a_part: "#1baf7a" };

const GROUP_NOTES: Record<RecoveryGroup, string> = {
  avec_recette: "Ventes (Too Good To Go, vente flash) : seules destinations qui rapportent une recette.",
  sans_recette: "Ordures ménagères, compost (Les Alchimistes), don, personnel et autres : aucune recette.",
  a_part: "Réutilisation dans une autre préparation et retours fournisseurs : ni vente, ni perte sans valeur.",
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Remarques d'un groupe : lignes sans kg, emballages, lignes sans coût, recettes à saisir. */
function notesOf(t: RecoveryTotals): string[] {
  return [
    t.notConverted > 0 ? `${plural(t.notConverted, "ligne")} sans poids en kg (non comptées dans les kg).` : null,
    t.nonFood > 0 ? `${plural(t.nonFood, "ligne")} d'emballages ou de moules (jamais en kg alimentaires).` : null,
    t.cost && t.cost.unvalued > 0 ? `${plural(t.cost.unvalued, "ligne")} sans coût connu.` : null,
    t.cost && t.cost.recoveryMissing > 0 ? `${plural(t.cost.recoveryMissing, "vente")} dont la recette reste à saisir (dans l'historique).` : null,
  ].filter((n): n is string => n != null);
}

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  if (!canReadStats(user)) redirect("/");
  const params = await searchParams;
  const ctx = await statsContext(user, params);
  const anchor = await anchorWeek(db, ctx);
  const [data, previous, next] = await Promise.all([recoveryDashboard(db, user, ctx.period, anchor, ctx.filters), adjacentOf(db, ctx.period, -1), adjacentOf(db, ctx.period, 1)]);
  const path = "/statistiques/valorisation";
  const note = scopeNote(user, ctx.compareTeams);
  const { groups, withCosts } = data;
  const sales = groups.avec_recette;
  const share = recoveredShare(sales);
  const perKg = recoveryPerKg(sales);
  const weekLabel = (n: number) => `S${String(n).padStart(2, "0")}`;
  const totalKg = (g: Record<RecoveryGroup, RecoveryTotals>) => RECOVERY_GROUPS.reduce((a, x) => a + g[x.key].foodKg, 0);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Accueil
      </Link>
      <h1 className="text-2xl font-bold">Valorisation — {periodLabel(ctx.period)}</h1>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      <StatsTabs user={user} ctx={ctx} active="valorisation" />
      <PeriodNav path={path} ctx={ctx} previous={previous} next={next} />
      <FilterForm path={path} ctx={ctx} />
      <p className="text-sm text-slate-600">
        La valorisation ne retire rien des pertes : un plat vendu, donné ou composté reste une perte. Cet onglet dit seulement ce qu&apos;il est devenu.
      </p>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Indicateurs principaux">
        {RECOVERY_GROUPS.map((g) => (
          <Stat key={g.key} label={g.key === "a_part" ? "À part" : g.label} value={`${num.format(groups[g.key].foodKg)} kg`} change={plural(groups[g.key].lines, "ligne")} />
        ))}
        {withCosts && sales.cost && (
          <Stat label="Recettes encaissées" value={euro.format(sales.cost.recoveredEur)} change={share != null ? `${pct.format(share)} du coût des produits vendus` : null} />
        )}
      </section>

      {RECOVERY_GROUPS.map((g) => {
        const t = groups[g.key];
        const rows = data.destinations.filter((d) => d.group === g.key);
        const notes = notesOf(t);
        return (
          <Card key={g.key} title={g.label}>
            <p className="text-sm text-slate-600">{GROUP_NOTES[g.key]}</p>
            {rows.length === 0 ? (
              <p className="text-slate-600">Aucune perte sur cette période.</p>
            ) : (
              <BarTable
                caption={`Kg par destination — ${g.label}`}
                rows={rows.map((d) => {
                  const s = recoveredShare(d);
                  return {
                    key: d.destinationId,
                    label: d.name,
                    value: d.foodKg,
                    text: `${num.format(d.foodKg)} kg`,
                    detail: [
                      plural(d.lines, g.key === "avec_recette" ? "vente" : "perte"),
                      d.cost ? `produits : ${euro.format(d.cost.grossEur)}` : null,
                      d.cost && g.key === "avec_recette" ? `recette : ${euro.format(d.cost.recoveredEur)}${s != null ? ` (${pct.format(s)} récupérés)` : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  };
                })}
              />
            )}
            {t.cost && t.lines > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-slate-600">Coût des produits</dt>
                  <dd className="font-semibold tabular-nums">{euro.format(t.cost.grossEur)}</dd>
                </div>
                {g.key === "avec_recette" && (
                  <>
                    <div>
                      <dt className="text-slate-600">Recettes</dt>
                      <dd className="font-semibold tabular-nums">{euro.format(t.cost.recoveredEur)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Part récupérée</dt>
                      <dd className="font-semibold tabular-nums">{share != null ? pct.format(share) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Recette par kg</dt>
                      <dd className="font-semibold tabular-nums">{perKg != null ? euro.format(perKg) : "—"}</dd>
                    </div>
                  </>
                )}
              </dl>
            )}
            {notes.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-slate-500">
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      {data.series.length > 0 && (
        <Card title="Semaine après semaine">
          <h3 className="font-medium">Kg de pertes alimentaires par devenir</h3>
          <StackedColumnChart
            caption="Kg de pertes alimentaires par semaine, répartis par devenir"
            format={(n) => `${num.format(n)} kg`}
            segments={RECOVERY_GROUPS.map((g) => ({ key: g.key, label: g.key === "a_part" ? "À part (réutilisation, retours)" : g.label, color: GROUP_COLORS[g.key] }))}
            columns={data.series.map((w) => ({
              key: `k-${w.id}`,
              label: weekLabel(w.number),
              values: Object.fromEntries(RECOVERY_GROUPS.map((g) => [g.key, w.groups[g.key].foodKg])),
              total: totalKg(w.groups),
              text: `${num.format(totalKg(w.groups))} kg`,
              highlight: w.number === anchor?.number && w.year === anchor?.year,
            }))}
          />
          {withCosts && (
            <>
              <h3 className="font-medium">Recettes encaissées</h3>
              <ColumnChart
                caption="Recettes encaissées par semaine"
                columns={data.series.map((w) => ({
                  key: `r-${w.id}`,
                  label: weekLabel(w.number),
                  value: w.groups.avec_recette.cost?.recoveredEur ?? 0,
                  text: euro.format(w.groups.avec_recette.cost?.recoveredEur ?? 0),
                  highlight: w.number === anchor?.number && w.year === anchor?.year,
                }))}
              />
            </>
          )}
          <p className="text-xs text-slate-500">12 dernières semaines de production jusqu&apos;à {anchor ? weekLabel(anchor.number) : "la semaine en cours"}, avec les mêmes filtres.</p>
        </Card>
      )}

      {withCosts && (
        <p className="text-xs text-slate-500">
          Coût des produits : coût brut figé de chaque perte, réparti entre ses destinations au prorata des quantités. Recettes : montants réellement encaissés.
        </p>
      )}
      <ExportLinks tab="valorisation" ctx={ctx} />
    </div>
  );
}
