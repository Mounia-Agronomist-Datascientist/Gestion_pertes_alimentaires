import Link from "next/link";
import { SURPLUS_SOURCES, type SurplusSource, surplusTrays } from "@/domain/surplus";
import type { surplusDashboard } from "@/modules/statistiques/surplus";
import { StackedColumnChart } from "../evolution/stacked-chart";
import { Card, euro, num } from "../shared";
import { CHART } from "../palette";

/** Couleurs fixes des trois sources (palette catégorielle validée, dans l'ordre : jamais réattribuées). */
const SOURCE_COLORS: Record<SurplusSource, string> = {
  tgtg: CHART.bordeaux,
  vente_flash: CHART.orange,
  linkee: CHART.caramel,
};
const SOURCE_NAMES: Record<SurplusSource, string> = {
  tgtg: "Too Good To Go",
  vente_flash: "Ventes flash",
  linkee: "Linkee",
};

const plural = (n: number, word: string, plural = `${word}s`) => `${num.format(n)} ${n > 1 ? plural : word}`;

function Figure({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
      {detail && <dd className="text-xs text-slate-500">{detail}</dd>}
    </div>
  );
}

/**
 * Ventes et dons des surplus de barquettes d'après les fichiers de l'entreprise (docs/PHASE5.md, étape 5.8).
 * Les montants ne s'additionnent pas : prix payé par les clients et versements HT pour Too Good To Go, chiffre
 * d'affaires TTC pour les ventes flash.
 */
export function SurplusSection({
  data,
  anchor,
  isAdmin,
}: {
  data: Awaited<ReturnType<typeof surplusDashboard>>;
  anchor: { year: number; number: number } | null;
  isAdmin: boolean;
}) {
  const { totals: t, withCosts } = data;
  const weekLabel = (n: number) => `S${String(n).padStart(2, "0")}`;
  return (
    <Card title="Ventes et dons des surplus de barquettes">
      <p className="text-sm text-slate-600">
        D&apos;après les fichiers de l&apos;entreprise (Too Good To Go, ventes flash, Linkee), qui font foi : les
        équipes ne déclarent plus ces destinations. Toute l&apos;entreprise ; les filtres ci-dessus ne s&apos;y
        appliquent pas.
      </p>
      {!data.hasFiles ? (
        <p className="text-slate-600">
          Aucun fichier déposé pour l&apos;instant
          {isAdmin ? (
            <>
              {" "}
              (
              <Link href="/admin/import" className="underline">
                Administration → Import
              </Link>
              ).
            </>
          ) : (
            "."
          )}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-label="Too Good To Go">
            <h3 className="font-medium">Too Good To Go</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <Figure label="Ventes" value={num.format(t.tgtg.sales)} />
              <Figure
                label="Barquettes vendues"
                value={num.format(t.tgtg.trays)}
                detail={t.tgtg.offeredTrays ? `sur ${num.format(t.tgtg.offeredTrays)} proposées` : null}
              />
              {withCosts && (
                <>
                  <Figure
                    label="Prix payé par les clients"
                    value={euro.format(t.tgtg.clientEur ?? 0)}
                    detail={t.tgtg.missingAmount ? `${plural(t.tgtg.missingAmount, "vente")} sans montant` : null}
                  />
                  <Figure
                    label="Versements reçus (HT, après commission)"
                    value={euro.format(t.tgtg.receivedEur ?? 0)}
                    detail={plural(t.tgtg.payouts, "versement")}
                  />
                </>
              )}
            </dl>
          </section>
          <section className="flex flex-col gap-2" aria-label="Ventes flash">
            <h3 className="font-medium">Ventes flash</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <Figure label="Ventes" value={num.format(t.flash.sales)} />
              <Figure
                label="Boxes vendues"
                value={num.format(t.flash.boxes)}
                detail={
                  t.flash.breakfastBoxes ? `dont ${num.format(t.flash.breakfastBoxes)} avec petit-déjeuner` : null
                }
              />
              <Figure
                label="Barquettes vendues"
                value={num.format(t.flash.trays + t.flash.breakfastTrays)}
                detail={
                  t.flash.breakfastTrays
                    ? `${num.format(t.flash.trays)} plats + ${num.format(t.flash.breakfastTrays)} petits-déjeuners`
                    : null
                }
              />
              {withCosts && (
                <Figure
                  label="Chiffre d'affaires TTC"
                  value={euro.format(t.flash.revenueEur ?? 0)}
                  detail={t.flash.missingAmount ? `${plural(t.flash.missingAmount, "vente")} sans montant` : null}
                />
              )}
            </dl>
          </section>
          <section className="flex flex-col gap-2" aria-label="Linkee">
            <h3 className="font-medium">Linkee (don, sans recette)</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <Figure
                label="Collectes"
                value={num.format(t.linkee.collections)}
                detail={plural(t.linkee.dishes, "plat")}
              />
              <Figure
                label="Barquettes données"
                value={num.format(t.linkee.trays)}
                detail={
                  t.linkee.notCollectedTrays
                    ? `dont ${num.format(t.linkee.notCollectedTrays)} sans « Collecté ? » coché`
                    : null
                }
              />
              <Figure
                label="Kg donnés"
                value={`${num.format(t.linkee.kg)} kg`}
                detail={
                  t.linkee.weighedTrays < t.linkee.trays
                    ? `pour ${num.format(t.linkee.weighedTrays)} barquettes retrouvées dans Melba`
                    : null
                }
              />
              {withCosts && (
                <Figure
                  label="Coût matières Melba"
                  value={euro.format(t.linkee.costEur ?? 0)}
                  detail={
                    t.linkee.costedTrays < t.linkee.trays
                      ? `pour ${num.format(t.linkee.costedTrays)} barquettes retrouvées dans Melba`
                      : null
                  }
                />
              )}
            </dl>
          </section>
          {data.series.length > 0 && (
            <>
              <h3 className="font-medium">Barquettes vendues ou données par semaine</h3>
              <StackedColumnChart
                caption="Barquettes vendues ou données par semaine de production, par canal"
                format={(n) => `${num.format(n)} barquettes`}
                segments={SURPLUS_SOURCES.map((k) => ({ key: k, label: SOURCE_NAMES[k], color: SOURCE_COLORS[k] }))}
                columns={data.series.map((w) => {
                  const trays = surplusTrays(w.totals);
                  const total = SURPLUS_SOURCES.reduce((a, k) => a + trays[k], 0);
                  return {
                    key: `s-${w.id}`,
                    label: weekLabel(w.number),
                    values: trays,
                    total,
                    text: num.format(total),
                    highlight: w.number === anchor?.number && w.year === anchor?.year,
                  };
                })}
              />
              <p className="text-xs text-slate-500">
                12 dernières semaines de production, par date de vente ou de collecte.
              </p>
            </>
          )}
          {withCosts && (
            <p className="text-xs text-slate-500">
              Les montants ne s&apos;additionnent pas entre eux : Too Good To Go donne le prix payé par les clients et
              les versements reçus HT après commission (chaque versement couvre les ventes précédentes et compte à sa
              date) ; les ventes flash, le chiffre d&apos;affaires TTC. Coût Linkee : barquettes × coût Melba d&apos;une
              portion de la semaine de production du lot.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
