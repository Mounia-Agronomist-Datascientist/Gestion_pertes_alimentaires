/**
 * Exports des statistiques (docs/PHASE4.md, étape 4.8 ; cahier des charges §23) : les tableaux de chaque onglet,
 * avec la même période, les mêmes filtres et les mêmes droits que l'écran (euros seulement avec « indicateurs
 * économiques »). Le même contenu sert au CSV et au classeur Excel (un onglet par tableau).
 */
import type { CsvTable, CsvValue } from "@/domain/csv";
import { periodLabel } from "@/domain/periodes";
import { formatProductionWeek } from "@/domain/semaine-production";
import type { RankBy, StatsSummary } from "@/domain/statistiques";
import { RECONCILIATION_STATUS_LABELS } from "@/domain/rapprochement";
import { RECOVERY_GROUPS, type RecoveryTotals, recoveredShare, recoveryPerKg } from "@/domain/valorisation";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { COST_COMPONENTS } from "@/modules/couts/summary";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import type { Db } from "@/db/types";
import { type Axis, axisDetail, compareAxis } from "./analysis";
import { anchorWeek, isUuid, type Params, type StatsContext } from "./context";
import { DESTINATION_KIND_STATS, generalDashboard } from "./dashboard";
import { annualEvolution, monthlyEvolution, weekComparison } from "./evolution";
import { PRODUCT_TYPES, type ProductType, causeAndDestinationRanking, productRanking } from "./rankings";
import { type RatioValues, weekRatios } from "./ratios";
import { recoveryDashboard } from "./valorisation";
import { alchimistesReconciliation, type ReconciliationPeriod } from "./alchimistes";
import { weeklySummary } from "./weekly";

export const EXPORT_TABS = ["general", "synthese", "zones", "equipes", "evolution", "ratios", "produits", "causes", "valorisation", "alchimistes"] as const;
export type ExportTab = (typeof EXPORT_TABS)[number];

export interface StatsExport {
  /** Nom du fichier sans extension. */
  name: string;
  tables: CsvTable[];
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** Kg au gramme près. */
export const roundKg = (n: number) => Math.round(n * 1000) / 1000;
/** Taux en pourcentage (2 décimales) ; vide s'il n'est pas calculé. */
const percent = (rate: number | null | undefined) => (rate == null ? null : Math.round(rate * 10_000) / 100);

/** Colonnes communes d'un agrégat : kg, barquettes, pertes et, pour les profils qui voient les euros, le détail du coût. */
export function summaryHeaders(withCosts: boolean): string[] {
  return [
    "Kg alimentaires",
    "Barquettes perdues",
    "Pertes",
    ...(withCosts ? [...COST_COMPONENTS.map((c) => `${c.label} (€)`), "Coût brut (€)", "Recettes (€)", "Coût net (€)"] : []),
  ];
}

export function summaryCells(s: StatsSummary, withCosts: boolean): CsvValue[] {
  return [
    roundKg(s.foodKg),
    s.barquettes,
    s.events,
    ...(withCosts ? [...COST_COMPONENTS.map((c) => s.cost?.[c.key] ?? 0), s.cost?.grossEur ?? 0, s.cost?.recoveredEur ?? 0, s.cost?.netEur ?? 0] : []),
  ];
}

/** Classement (libellé + agrégat) précédé de la période. */
function ranked(title: string, first: string, period: string, rows: { label: string; summary: StatsSummary }[], withCosts: boolean, extra?: { headers: string[]; cells: (i: number) => CsvValue[] }): CsvTable {
  return {
    title,
    headers: ["Période", first, ...summaryHeaders(withCosts), ...(extra?.headers ?? [])],
    rows: rows.map((r, i) => [period, r.label, ...summaryCells(r.summary, withCosts), ...(extra?.cells(i) ?? [])]),
  };
}

/** Nom de fichier sans accents ni espaces (« zones-s45-2026 »). */
export function fileName(...parts: string[]): string {
  return parts
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const rankBy = (user: AuthUser, tri: string | undefined): RankBy => (tri === "cout" && can(user, "indicators.read") ? "cout" : tri === "evenements" ? "evenements" : "kg");

export async function statsExport(db: Db, user: AuthUser, tab: ExportTab, ctx: StatsContext, params: Params): Promise<StatsExport | null> {
  const withCosts = can(user, "indicators.read");
  const label = periodLabel(ctx.period);

  switch (tab) {
    case "general": {
      const d = await generalDashboard(db, user, ctx.period, ctx.filters);
      const periods = [{ label, summary: d.current }, ...(d.previous && d.previousPeriod ? [{ label: periodLabel(d.previousPeriod), summary: d.previous }] : [])];
      return {
        name: fileName("statistiques", label),
        tables: [
          { title: "Indicateurs", headers: ["Période", ...summaryHeaders(withCosts)], rows: periods.map((p) => [p.label, ...summaryCells(p.summary, withCosts)]) },
          {
            title: "Devenir des pertes",
            headers: ["Période", "Destination", "Kg alimentaires"],
            rows: DESTINATION_KIND_STATS.map((k) => [label, k.label, roundKg(d.current.kgByDestinationKind[k.kind] ?? 0)]),
          },
        ],
      };
    }

    case "zones":
    case "equipes": {
      const axis: Axis = tab === "zones" ? "zone" : "equipe";
      const one = axis === "zone" ? "Zone" : "Équipe";
      const id = isUuid(params.id) ? params.id : axis === "equipe" && !ctx.compareTeams ? user.teamId : null;
      if (!id) {
        if (axis === "equipe" && !ctx.compareTeams) return null;
        const result = await compareAxis(db, user, axis, ctx.period, ctx.filters);
        const previous = result.previousPeriod ? periodLabel(result.previousPeriod) : null;
        return {
          name: fileName(tab, label),
          tables: [
            ranked(`Par ${one.toLowerCase()}`, one, label, result.rows, withCosts, {
              headers: previous ? [`Kg alimentaires ${previous}`, ...(withCosts ? [`Coût brut ${previous} (€)`] : [])] : [],
              cells: (i) => {
                const p = result.rows[i]!.previous;
                return previous ? [roundKg(p?.foodKg ?? 0), ...(withCosts ? [p?.cost?.grossEur ?? 0] : [])] : [];
              },
            }),
          ],
        };
      }
      if (axis === "equipe" && !ctx.compareTeams && id !== user.teamId) return null;
      const detail = await axisDetail(db, user, axis, id, ctx.period, ctx.filters);
      if (!detail.label) return null;
      const tables = [
        ranked("Causes", "Cause", label, detail.causes, withCosts),
        ranked("Produits", "Produit", label, detail.products, withCosts, {
          headers: ["Type de produit"],
          cells: (i) => [PRODUCT_CATEGORY_LABELS[detail.products[i]!.category as keyof typeof PRODUCT_CATEGORY_LABELS] ?? detail.products[i]!.category],
        }),
        ranked("Sous-zones", "Sous-zone", label, detail.subzones, withCosts),
        ...(detail.teams.length ? [ranked("Équipes", "Équipe", label, detail.teams, withCosts)] : []),
        {
          title: "Semaines",
          headers: ["Semaine", ...summaryHeaders(withCosts)],
          rows: detail.weeks.map((w) => [formatProductionWeek(w), ...summaryCells(w.summary, withCosts)]),
        },
      ];
      return { name: fileName(tab, detail.label, label), tables };
    }

    case "produits": {
      const type: ProductType = params.type && params.type in PRODUCT_TYPES ? (params.type as ProductType) : "plats";
      const ranking = await productRanking(db, user, ctx.period, ctx.filters, type, rankBy(user, params.tri));
      return {
        name: fileName("produits", PRODUCT_TYPES[type].label, label),
        tables: [
          ranked(PRODUCT_TYPES[type].label, "Produit", label, ranking.rows, withCosts, {
            headers: ["Type de produit", "Cause principale", "Part de la cause principale (%)", "Sert aux plats", "Plats de la formule"],
            cells: (i) => {
              const r = ranking.rows[i]!;
              return [
                PRODUCT_CATEGORY_LABELS[r.category as keyof typeof PRODUCT_CATEGORY_LABELS] ?? r.category,
                r.mainCause?.name ?? null,
                percent(r.mainCause?.share),
                r.usedIn?.join(", ") ?? null,
                r.names.join(" ; ") || null,
              ];
            },
          }),
        ],
      };
    }

    case "causes": {
      const ranking = await causeAndDestinationRanking(db, user, ctx.period, ctx.filters, rankBy(user, params.tri));
      return {
        name: fileName("causes", label),
        tables: [
          ranked("Causes", "Cause", label, ranking.causes, withCosts, { headers: ["Surtout en"], cells: (i) => [ranking.causes[i]!.mainZone] }),
          { title: "Destinations", headers: ["Période", "Destination", "Kg alimentaires", "Pertes"], rows: ranking.destinations.map((d) => [label, d.name, roundKg(d.foodKg), d.events]) },
        ],
      };
    }

    case "valorisation": {
      const anchor = await anchorWeek(db, ctx);
      const data = await recoveryDashboard(db, user, ctx.period, anchor, ctx.filters);
      const groupLabel = new Map<string, string>(RECOVERY_GROUPS.map((g) => [g.key, g.label]));
      const headers = [
        "Lignes",
        "Kg alimentaires",
        "Lignes sans kg",
        "Lignes emballages / moules",
        ...(withCosts ? ["Coût des produits (€)", "Lignes sans coût", "Recettes (€)", "Ventes recette à saisir", "Part récupérée (%)", "Recette par kg (€)"] : []),
      ];
      // Recette, part récupérée et recette par kg : ventes seulement (vide pour les autres groupes).
      const cells = (t: RecoveryTotals, sale: boolean): CsvValue[] => [
        t.lines,
        roundKg(t.foodKg),
        t.notConverted,
        t.nonFood,
        ...(t.cost
          ? [t.cost.grossEur, t.cost.unvalued, ...(sale ? [t.cost.recoveredEur, t.cost.recoveryMissing, percent(recoveredShare(t)), recoveryPerKg(t)] : [null, null, null, null])]
          : []),
      ];
      const tables: CsvTable[] = [
        {
          title: "Destinations",
          headers: ["Période", "Groupe", "Destination", ...headers],
          rows: [
            ...RECOVERY_GROUPS.map((g) => [label, g.label, "Total du groupe", ...cells(data.groups[g.key], g.key === "avec_recette")]),
            ...data.destinations.map((d) => [label, groupLabel.get(d.group)!, d.name, ...cells(d, d.group === "avec_recette")]),
          ],
        },
      ];
      if (data.series.length)
        tables.push({
          title: "12 semaines",
          headers: ["Semaine", ...RECOVERY_GROUPS.map((g) => `Kg ${g.label.toLowerCase()}`), ...(withCosts ? ["Recettes (€)"] : [])],
          rows: data.series.map((w) => [
            formatProductionWeek(w),
            ...RECOVERY_GROUPS.map((g) => roundKg(w.groups[g.key].foodKg)),
            ...(withCosts ? [w.groups.avec_recette.cost?.recoveredEur ?? 0] : []),
          ]),
        });
      return { name: fileName("valorisation", label), tables };
    }

    case "alchimistes": {
      if (!ctx.compareTeams) return null;
      const anchor = await anchorWeek(db, ctx);
      if (!anchor) return null;
      const data = await alchimistesReconciliation(db, user, anchor);
      if (!data) return null;
      const headers = ["Du", "Au", "Kg déclarés vers Les Alchimistes", "Lignes déclarées", "Lignes sans kg", "Kg pesés", "Bacs", "Écart pesé − déclaré (kg)", "Écart / pesé (%)", "État"];
      const cells = (r: ReconciliationPeriod): CsvValue[] => [
        r.from,
        r.to,
        roundKg(r.declaredKg),
        r.declaredLines,
        r.notConverted,
        r.status === "sans_fichier" ? null : roundKg(r.measuredKg),
        r.status === "sans_fichier" ? null : r.bins,
        r.gapKg == null ? null : roundKg(r.gapKg),
        percent(r.gapRate),
        RECONCILIATION_STATUS_LABELS[r.status],
      ];
      return {
        name: fileName("alchimistes", periodLabel(anchor)),
        tables: [
          { title: "Semaines", headers: ["Semaine", ...headers], rows: data.weeks.map((w) => [w.label, ...cells(w)]) },
          { title: "Mois", headers: ["Mois", ...headers], rows: data.months.map((m) => [m.label, ...cells(m)]) },
        ],
      };
    }

    case "evolution": {
      const anchor = await anchorWeek(db, ctx);
      if (!anchor) return null;
      const comparison = await weekComparison(db, user, anchor, ctx.filters);
      if (!comparison) return null;
      const last = comparison.series.at(-1)!;
      const [weekRow] = await db.query.productionWeeks.findMany({ where: (w, { eq }) => eq(w.id, last.id), limit: 1 });
      const endMonth = { year: Number(weekRow!.endDate.slice(0, 4)), month: Number(weekRow!.endDate.slice(5, 7)) };
      const [months, years] = await Promise.all([monthlyEvolution(db, user, endMonth, ctx.filters), annualEvolution(db, user, anchor.year, ctx.filters)]);
      const firstMonth = months.findIndex((m) => m.summary.events > 0);
      return {
        name: fileName("evolution", periodLabel(anchor)),
        tables: [
          {
            title: "Semaines",
            headers: [
              "Semaine",
              ...summaryHeaders(withCosts),
              "Barquettes prévues",
              "Barquettes produites",
              "Kg pour 1 000 barquettes prévues",
              "Kg pour 1 000 barquettes produites",
            ],
            rows: comparison.series.map((p) => [
              formatProductionWeek(p),
              ...summaryCells(p.summary, withCosts),
              p.planned?.barquettes ?? null,
              p.actual?.barquettes ?? null,
              p.perThousand,
              p.perThousandActual,
            ]),
          },
          {
            title: "Mois",
            headers: ["Mois", ...summaryHeaders(withCosts)],
            rows: (firstMonth < 0 ? months.slice(-1) : months.slice(firstMonth)).map((m) => [`${MONTHS[m.month - 1]} ${m.year}`, ...summaryCells(m.summary, withCosts)]),
          },
          { title: "Années", headers: ["Année de production", ...summaryHeaders(withCosts)], rows: years.map((y) => [String(y.year), ...summaryCells(y.summary, withCosts)]) },
        ],
      };
    }

    case "ratios": {
      const anchor = await anchorWeek(db, ctx);
      if (!anchor) return null;
      const ratios = await weekRatios(db, user, anchor, ctx.filters);
      if (!ratios) return null;
      const sources = [
        ["prevu", "prévu"],
        ["reel", "réel"],
      ] as const;
      const headers = sources.flatMap(([, s]) => [
        `Barquettes perdues / barquettes (${s}) (%)`,
        `Barquettes perdues`,
        `Barquettes (${s})`,
        `Kg perdus / kg (${s}) (%)`,
        `Kg alimentaires perdus`,
        `Kg (${s})`,
        ...(ratios.withCosts ? [`Coût matières pertes / production (${s}) (%)`, `Coût matières des pertes (€)`, `Coût matières de la production (${s}) (€)`] : []),
      ]);
      const cells = (v: RatioValues | null): CsvValue[] => [
        percent(v?.barquetteRate),
        v?.lostBarquettes ?? null,
        v?.producedBarquettes ?? null,
        percent(v?.kgRate),
        v ? roundKg(v.foodKg) : null,
        v?.producedKg ?? null,
        ...(ratios.withCosts ? [percent(v?.costRate), v?.materialLossEur ?? null, v?.productionCostEur ?? null] : []),
      ];
      return {
        name: fileName("ratios", periodLabel(anchor)),
        tables: [
          {
            title: "Ratios",
            headers: ["Période", ...headers],
            rows: [
              ...ratios.series.map((w) => [formatProductionWeek(w), ...cells(w.prevu), ...cells(w.reel)]),
              [`${ratios.year.year} jusqu'à ${formatProductionWeek(anchor)}`, ...cells(ratios.year.prevu), ...cells(ratios.year.reel)],
            ],
          },
        ],
      };
    }

    case "synthese": {
      const anchor = await anchorWeek(db, ctx);
      if (!anchor) return null;
      const data = await weeklySummary(db, user, anchor, ctx.filters);
      if (!data) return null;
      const week = formatProductionWeek(anchor);
      const unit = data.by === "cout" ? "Coût brut (€)" : "Kg";
      const lines = [...data.byZone.map((r) => ["Zone", r] as const), ...data.byCause.map((r) => ["Cause", r] as const), ...data.byProduct.map((r) => ["Produit", r] as const)];
      const weeks: CsvTable = {
        title: "12 semaines",
        headers: [
          "Semaine",
          ...summaryHeaders(withCosts),
          "Barquettes prévues",
          "Barquettes produites",
          "Kg pour 1 000 barquettes prévues",
          "Kg pour 1 000 barquettes produites",
        ],
        rows: data.comparison.series.map((p) => [
          formatProductionWeek(p),
          ...summaryCells(p.summary, withCosts),
          p.planned?.barquettes ?? null,
          p.actual?.barquettes ?? null,
          p.perThousand,
          p.perThousandActual,
        ]),
      };
      const detail: CsvTable = {
        title: "Détail de la semaine",
        headers: ["Semaine", "Type", "Libellé", unit, "Part de la semaine (%)", `${unit} semaine précédente`, "Écart", "Pertes", "Kg alimentaires"],
        rows: lines.map(([kind, r]) => [week, kind, r.label, r.value, Math.round(r.share * 1000) / 10, r.previous, r.delta, r.summary.events, roundKg(r.summary.foodKg)]),
      };
      if (params.tableau === "semaines") return { name: fileName("synthese", week, "12-semaines"), tables: [weeks] };
      if (params.tableau === "detail") return { name: fileName("synthese", week, "detail"), tables: [detail] };
      return { name: fileName("synthese", week), tables: [weeks, detail] };
    }
  }
}
