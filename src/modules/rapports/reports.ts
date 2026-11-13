/**
 * Rapports PDF (docs/PHASE5.md, étape 5.7 ; cahier des charges §23 ; décision du 12/11/2026) :
 * - hebdomadaire (semaine de production) ;
 * - mensuel ou annuel (mois ou année civile) ;
 * - valorisation (période choisie) ;
 * - environnemental, avec le rapprochement des Alchimistes (période choisie).
 * Mêmes données, droits et filtres que les onglets des statistiques : une équipe n'a que ses pertes, les euros
 * sont réservés aux profils « indicateurs économiques », le rapprochement des Alchimistes aux vues d'entreprise.
 */
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type Period, periodLabel } from "@/domain/periodes";
import { RECONCILIATION_STATUS_LABELS } from "@/domain/rapprochement";
import { formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { type StatsSummary } from "@/domain/statistiques";
import { RECOVERY_GROUPS, recoveredShare, recoveryPerKg } from "@/domain/valorisation";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { alchimistesReconciliation, canReadReconciliation } from "@/modules/statistiques/alchimistes";
import { compareAxis } from "@/modules/statistiques/analysis";
import { anchorWeek, type StatsContext } from "@/modules/statistiques/context";
import { DESTINATION_KIND_STATS, generalDashboard } from "@/modules/statistiques/dashboard";
import { environmentDashboard } from "@/modules/statistiques/environnement";
import { monthlyEvolution } from "@/modules/statistiques/evolution";
import { fileName } from "@/modules/statistiques/exports";
import { causeAndDestinationRanking, productRanking } from "@/modules/statistiques/rankings";
import { recoveryDashboard } from "@/modules/statistiques/valorisation";
import { weeklySummary } from "@/modules/statistiques/weekly";
import { ReportPdf, ROW_HEIGHT } from "./pdf";

/** Hauteur d'un tableau de n lignes, pour garder un titre avec son tableau. */
const tableHeight = (rows: number) => (rows + 2) * ROW_HEIGHT + 8;
/** Hauteur d'une liste de barres. */
const barsHeight = (rows: number) => Math.min(rows, 3) * 24;

export const REPORT_TYPES = ["hebdomadaire", "mensuel", "annuel", "valorisation", "environnemental"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const kg = (n: number) => `${num.format(n)} kg`;
const co2 = (n: number) => (n >= 1000 ? `${num.format(n / 1000)} t CO2e` : `${num.format(n)} kg CO2e`);
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const categoryLabel = (c: string) => PRODUCT_CATEGORY_LABELS[c as keyof typeof PRODUCT_CATEGORY_LABELS] ?? c;
const kindLabel = (k: string) => DESTINATION_KIND_STATS.find((d) => d.kind === k)?.label ?? k;

/** Évolution courte (« +12 % vs S44-2026 »). */
function trend(current: number, previous: number | null | undefined, label: string | null): string | null {
  if (previous == null || !label) return null;
  if (previous === 0) return current > 0 ? `nouveau vs ${label}` : `= ${label}`;
  const p = Math.round(((current - previous) / previous) * 100);
  return `${p > 0 ? "+" : ""}${p} % vs ${label}`;
}

/** Périmètre et filtres, écrits en clair en tête du rapport. */
async function scopeText(db: Db, user: AuthUser, ctx: StatsContext): Promise<string> {
  const parts: string[] = [];
  if (!ctx.compareTeams) parts.push(user.team ? `Équipe ${user.team.letter} – ${user.team.colorName} : ses pertes uniquement.` : "Vos zones uniquement.");
  else parts.push("Toute l'entreprise.");
  const filters: string[] = [];
  if (ctx.filters.zoneId) filters.push(`zone ${(await db.select({ name: s.zones.name }).from(s.zones).where(eq(s.zones.id, ctx.filters.zoneId)))[0]?.name ?? "?"}`);
  if (ctx.filters.teamId) {
    const [t] = await db.select().from(s.teams).where(eq(s.teams.id, ctx.filters.teamId));
    filters.push(`équipe ${t ? `${t.letter} – ${t.colorName}` : "?"}`);
  }
  if (ctx.filters.category) filters.push(`catégorie ${categoryLabel(ctx.filters.category)}`);
  if (filters.length) parts.push(`Filtres : ${filters.join(", ")}.`);
  return parts.join(" ");
}

function summaryFigures(r: ReportPdf, current: StatsSummary, previous: StatsSummary | null, previousLabel: string | null, withCosts: boolean) {
  r.figures([
    { label: "Pertes alimentaires", value: kg(current.foodKg), note: trend(current.foodKg, previous?.foodKg, previousLabel) },
    ...(withCosts && current.cost
      ? [
          { label: "Coût brut", value: euro.format(current.cost.grossEur), note: trend(current.cost.grossEur, previous?.cost?.grossEur, previousLabel) },
          { label: "Coût net (après recettes)", value: euro.format(current.cost.netEur), note: trend(current.cost.netEur, previous?.cost?.netEur, previousLabel) },
        ]
      : []),
    { label: "Barquettes perdues", value: num.format(current.barquettes), note: trend(current.barquettes, previous?.barquettes, previousLabel) },
    { label: "Déclarations", value: String(current.events), note: trend(current.events, previous?.events, previousLabel) },
  ]);
  const notes: string[] = [];
  if (current.foodNotConverted > 0) notes.push(`${plural(current.foodNotConverted, "perte")} alimentaire(s) sans poids en kg : non comptée(s) dans les kg.`);
  if (current.nonFood.events > 0) notes.push(`${plural(current.nonFood.events, "perte")} d'emballages ou de moules, comptée(s) à part (jamais en kg alimentaires).`);
  if (withCosts && current.cost && current.events - current.cost.valued > 0) notes.push(`${plural(current.events - current.cost.valued, "perte")} sans coût connu.`);
  if (notes.length) r.paragraph(notes.join(" "), { muted: true, size: 8.5 });
}

async function weekly(db: Db, user: AuthUser, ctx: StatsContext, r: () => Promise<ReportPdf>, setTitle: (t: string, sub: string) => void) {
  const anchor = await anchorWeek(db, ctx);
  if (!anchor) return null;
  const data = await weeklySummary(db, user, anchor, ctx.filters);
  if (!data) return null;
  setTitle("Rapport hebdomadaire des pertes", formatProductionWeek(anchor));
  const pdf = await r();
  pdf.cover(await scopeText(db, user, ctx));
  const previousLabel = data.previousPeriod ? periodLabel(data.previousPeriod) : null;
  summaryFigures(pdf, data.summary, data.comparison.previous?.summary ?? null, previousLabel, data.withCosts);
  const inEuros = data.by === "cout";
  const value = (v: number) => (inEuros ? euro.format(v) : kg(v));

  pdf.heading("Où s'améliorer en priorité");
  if (data.summary.events === 0) pdf.paragraph("Aucune perte cette semaine.");
  else {
    pdf.bullets(
      [
        data.byZone[0] && `Zone : ${data.byZone[0].label} — ${value(data.byZone[0].value)} (${pct.format(data.byZone[0].share)} de la semaine)`,
        data.byCause[0] && `Cause : ${data.byCause[0].label} — ${value(data.byCause[0].value)} (${pct.format(data.byCause[0].share)})`,
        data.byProduct[0] && `Produit : ${data.byProduct[0].label} — ${value(data.byProduct[0].value)} (${pct.format(data.byProduct[0].share)})`,
        ...data.rises.map((x) => `En hausse vs ${previousLabel} : ${x.kind.toLowerCase()} « ${x.label} », +${value(x.delta)} (${value(x.previous)} -> ${value(x.value)})`),
      ].filter((x): x is string => !!x),
    );
    pdf.paragraph(`Classement ${inEuros ? "en coût brut (euros)" : "en kg de pertes alimentaires"}.`, { muted: true, size: 8.5 });
  }
  const bars = (rows: typeof data.byZone) => rows.slice(0, 10).map((x) => ({ label: x.label, value: x.value, text: value(x.value), detail: `${plural(x.summary.events, "perte")} · ${pct.format(x.share)}` }));
  if (data.byZone.length) {
    pdf.heading("Par zone", barsHeight(data.byZone.length));
    pdf.bars(bars(data.byZone));
  }
  if (data.byCause.length) {
    pdf.heading("Par cause", barsHeight(data.byCause.length));
    pdf.bars(bars(data.byCause));
  }
  if (data.byProduct.length) {
    pdf.heading("Produits qui pèsent le plus", barsHeight(data.byProduct.length));
    pdf.bars(bars(data.byProduct));
  }
  pdf.heading("Les 12 dernières semaines", tableHeight(data.comparison.series.length) + 20);
  pdf.paragraph("Kg pour 1 000 barquettes : un tiret quand le « Décompte barquettes » de la semaine n'est pas déposé.", { muted: true, size: 8.5 });
  pdf.table(
    [
      { header: "Semaine", width: 1.2 },
      { header: "Kg alimentaires", width: 1.2, align: "right" },
      ...(data.withCosts ? [{ header: "Coût brut", width: 1.2, align: "right" as const }] : []),
      { header: "Déclarations", width: 1, align: "right" },
      { header: "Kg / 1 000 barquettes produites", width: 1.8, align: "right" },
    ],
    data.comparison.series.map((p) => [
      formatProductionWeek(p),
      kg(p.summary.foodKg),
      ...(data.withCosts ? [euro.format(p.summary.cost?.grossEur ?? 0)] : []),
      String(p.summary.events),
      p.perThousandActual == null ? "—" : kg(p.perThousandActual),
    ]),
  );
  return { pdf, name: fileName("rapport-hebdomadaire", formatProductionWeek(anchor)) };
}

async function periodic(db: Db, user: AuthUser, ctx: StatsContext, period: Extract<Period, { kind: "mois" | "annee" }>, r: () => Promise<ReportPdf>, setTitle: (t: string, sub: string) => void) {
  const withCosts = can(user, "indicators.read");
  const by = withCosts ? "cout" : "kg";
  const [general, zones, teams, causes, products] = await Promise.all([
    generalDashboard(db, user, period, ctx.filters),
    compareAxis(db, user, "zone", period, ctx.filters),
    ctx.compareTeams ? compareAxis(db, user, "equipe", period, ctx.filters) : Promise.resolve(null),
    causeAndDestinationRanking(db, user, period, ctx.filters, by),
    productRanking(db, user, period, ctx.filters, "tous", by),
  ]);
  const months = period.kind === "annee" ? await monthlyEvolution(db, user, { year: period.year, month: 12 }, ctx.filters) : await monthlyEvolution(db, user, { year: period.year, month: period.month }, ctx.filters);
  const label = periodLabel(period);
  setTitle(period.kind === "annee" ? "Rapport annuel des pertes" : "Rapport mensuel des pertes", label.charAt(0).toUpperCase() + label.slice(1));
  const pdf = await r();
  pdf.cover(`${await scopeText(db, user, ctx)} Mois et années : date réelle de la perte.`);
  const previousLabel = general.previousPeriod ? periodLabel(general.previousPeriod) : null;
  summaryFigures(pdf, general.current, general.previous, previousLabel, withCosts);

  pdf.heading("Devenir des pertes alimentaires", 48);
  const kinds = DESTINATION_KIND_STATS.map((d) => ({ ...d, kg: general.current.kgByDestinationKind[d.kind] ?? 0 })).filter((d) => d.kg > 0);
  if (kinds.length) pdf.bars(kinds.map((d) => ({ label: d.label, value: d.kg, text: kg(d.kg) })));
  else pdf.paragraph("Aucune quantité en kg sur la période.");

  const axisTable = (first: string, rows: NonNullable<typeof teams>["rows"]) =>
    pdf.table(
      [
        { header: first, width: 2 },
        { header: "Kg alimentaires", width: 1.2, align: "right" },
        ...(withCosts ? [{ header: "Coût brut", width: 1.2, align: "right" as const }] : []),
        { header: "Déclarations", width: 1, align: "right" },
        { header: "Kg vs période préc.", width: 1.5, align: "right" },
      ],
      rows.map((x) => [x.label, kg(x.summary.foodKg), ...(withCosts ? [euro.format(x.summary.cost?.grossEur ?? 0)] : []), String(x.summary.events), trend(x.summary.foodKg, x.previous?.foodKg, "")?.replace(" vs ", "") ?? "—"]),
    );
  pdf.heading("Par zone", tableHeight(zones.rows.length));
  if (zones.rows.length) axisTable("Zone", zones.rows);
  else pdf.paragraph("Aucune perte sur la période.");
  if (teams?.rows.length) {
    pdf.heading("Par équipe", tableHeight(teams.rows.length));
    axisTable("Équipe", teams.rows);
  }
  const value = (x: StatsSummary) => (by === "cout" ? (x.cost?.grossEur ?? 0) : x.foodKg);
  const text = (x: StatsSummary) => (by === "cout" ? euro.format(x.cost?.grossEur ?? 0) : kg(x.foodKg));
  if (causes.causes.length) {
    pdf.heading("Causes principales", barsHeight(causes.causes.length));
    pdf.bars(causes.causes.slice(0, 10).map((c) => ({ label: c.label, value: value(c.summary), text: text(c.summary), detail: [plural(c.summary.events, "perte"), c.mainZone ? `surtout en ${c.mainZone}` : null].filter(Boolean).join(" · ") })));
  }
  if (products.rows.length) {
    pdf.heading("Produits qui pèsent le plus", barsHeight(products.rows.length));
    pdf.bars(products.rows.slice(0, 10).map((p) => ({ label: p.label, value: value(p.summary), text: text(p.summary), detail: `${categoryLabel(p.category)} · ${plural(p.summary.events, "perte")}` })));
  }
  pdf.heading(period.kind === "annee" ? `Mois par mois en ${period.year}` : "Les 12 derniers mois", tableHeight(months.length));
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  pdf.table(
    [
      { header: "Mois", width: 1.2 },
      { header: "Kg alimentaires", width: 1.2, align: "right" },
      ...(withCosts ? [{ header: "Coût brut", width: 1.2, align: "right" as const }, { header: "Coût net", width: 1.2, align: "right" as const }] : []),
      { header: "Déclarations", width: 1, align: "right" },
    ],
    months.map((m) => [`${MONTHS[m.month - 1]} ${m.year}`, kg(m.summary.foodKg), ...(withCosts ? [euro.format(m.summary.cost?.grossEur ?? 0), euro.format(m.summary.cost?.netEur ?? 0)] : []), String(m.summary.events)]),
  );
  return { pdf, name: period.kind === "annee" ? fileName("rapport-annuel", String(period.year)) : fileName("rapport-mensuel", label) };
}

async function recovery(db: Db, user: AuthUser, ctx: StatsContext, r: () => Promise<ReportPdf>, setTitle: (t: string, sub: string) => void) {
  const anchor = await anchorWeek(db, ctx);
  const data = await recoveryDashboard(db, user, ctx.period, anchor, ctx.filters);
  const label = periodLabel(ctx.period);
  setTitle("Rapport de valorisation", label);
  const pdf = await r();
  pdf.cover(`${await scopeText(db, user, ctx)} La valorisation ne retire rien des pertes : un plat vendu, donné ou composté reste une perte.`);
  const sales = data.groups.avec_recette;
  pdf.figures([
    ...RECOVERY_GROUPS.map((g) => ({ label: g.key === "a_part" ? "À part (réutilisation, retours)" : g.label, value: kg(data.groups[g.key].foodKg), note: plural(data.groups[g.key].lines, "ligne") })),
    ...(data.withCosts && sales.cost
      ? [{ label: "Recettes encaissées", value: euro.format(sales.cost.recoveredEur), note: recoveredShare(sales) != null ? `${pct.format(recoveredShare(sales)!)} du coût des ventes` : null }]
      : []),
  ]);
  for (const g of RECOVERY_GROUPS) {
    const rows = data.destinations.filter((d) => d.group === g.key);
    const t = data.groups[g.key];
    pdf.heading(g.label, tableHeight(rows.length + 1));
    if (!rows.length) {
      pdf.paragraph("Aucune perte sur cette période.");
      continue;
    }
    const sale = g.key === "avec_recette";
    pdf.table(
      [
        { header: "Destination", width: 2 },
        { header: "Lignes", width: 0.7, align: "right" },
        { header: "Kg", width: 0.9, align: "right" },
        ...(data.withCosts ? [{ header: "Coût produits", width: 1.2, align: "right" as const }] : []),
        ...(data.withCosts && sale
          ? [
              { header: "Recettes", width: 1, align: "right" as const },
              { header: "% récupéré", width: 1, align: "right" as const },
              { header: "Recette/kg", width: 1, align: "right" as const },
            ]
          : []),
      ],
      rows.map((d) => [
        d.name,
        String(d.lines),
        kg(d.foodKg),
        ...(d.cost ? [euro.format(d.cost.grossEur)] : []),
        ...(d.cost && sale ? [euro.format(d.cost.recoveredEur), recoveredShare(d) != null ? pct.format(recoveredShare(d)!) : "—", recoveryPerKg(d) != null ? euro.format(recoveryPerKg(d)!) : "—"] : []),
      ]),
      {
        total: [
          "Total",
          String(t.lines),
          kg(t.foodKg),
          ...(t.cost ? [euro.format(t.cost.grossEur)] : []),
          ...(t.cost && sale ? [euro.format(t.cost.recoveredEur), recoveredShare(t) != null ? pct.format(recoveredShare(t)!) : "—", recoveryPerKg(t) != null ? euro.format(recoveryPerKg(t)!) : "—"] : []),
        ],
      },
    );
    if (t.cost && t.cost.recoveryMissing > 0) pdf.paragraph(`${plural(t.cost.recoveryMissing, "vente")} dont la recette reste à saisir.`, { muted: true, size: 8.5 });
  }
  if (data.series.length) {
    pdf.heading("Les 12 dernières semaines", tableHeight(data.series.length));
    pdf.table(
      [{ header: "Semaine", width: 1 }, ...RECOVERY_GROUPS.map((g) => ({ header: g.key === "a_part" ? "Kg à part" : `Kg ${g.label.toLowerCase()}`, width: 1.2, align: "right" as const })), ...(data.withCosts ? [{ header: "Recettes", width: 1, align: "right" as const }] : [])],
      data.series.map((w) => [formatProductionWeek(w), ...RECOVERY_GROUPS.map((g) => kg(w.groups[g.key].foodKg)), ...(data.withCosts ? [euro.format(w.groups.avec_recette.cost?.recoveredEur ?? 0)] : [])]),
    );
  }
  if (data.withCosts) pdf.paragraph("Coût des produits : coût brut figé de chaque perte, réparti entre ses destinations au prorata des quantités. Recettes : montants réellement encaissés.", { muted: true, size: 8.5 });
  return { pdf, name: fileName("rapport-valorisation", label) };
}

async function environment(db: Db, user: AuthUser, ctx: StatsContext, r: () => Promise<ReportPdf>, setTitle: (t: string, sub: string) => void) {
  const anchor = await anchorWeek(db, ctx);
  const data = await environmentDashboard(db, user, ctx.period, anchor, ctx.filters, { category: categoryLabel, destinationKind: kindLabel });
  const label = periodLabel(ctx.period);
  setTitle("Rapport environnemental", label);
  const pdf = await r();
  pdf.cover(
    `${await scopeText(db, user, ctx)} Impact carbone de la production des denrées perdues, jusqu'à leur livraison (Agribalyse 3.2, ADEME, facteurs validés) : ce n'est pas le bilan carbone de l'entreprise.`,
  );
  const s = data.summary;
  const foodKg = s.kg.mesure + s.kg.estime + s.kg.non_couvert;
  const share = (v: number) => (foodKg > 0 ? `${pct.format(v / foodKg)} des kg perdus` : null);
  pdf.figures([
    { label: "Impact CO2e", value: co2(s.co2eKg), note: s.co2ByMethod.estime > 0 ? `dont ${co2(s.co2ByMethod.estime)} estimés` : null },
    { label: "Kg mesurés", value: kg(s.kg.mesure), note: share(s.kg.mesure) },
    { label: "Kg estimés", value: kg(s.kg.estime), note: share(s.kg.estime) },
    { label: "Kg non couverts", value: kg(s.kg.non_couvert), note: share(s.kg.non_couvert) },
  ]);
  if (data.validFactors === 0) pdf.paragraph("Aucun facteur d'émission validé : tout est non couvert.");
  pdf.bullets([
    "Mesuré : CO2e calculé à partir de la recette Melba et du facteur de chaque ingrédient.",
    "Estimé : perte hors liste, à partir de la famille de son libellé.",
    "Non couvert : ingrédients sans famille ou sans facteur validé (épices, fonds…), jamais estimés.",
    ...(data.nonFood > 0 ? [`${plural(data.nonFood, "perte")} d'emballages ou de moules non comptée(s).`] : []),
  ]);
  const co2Bars = (groups: typeof data.byCategory) => groups.map((g) => ({ label: g.label, value: g.summary.co2eKg, text: co2(g.summary.co2eKg), detail: `${kg(g.summary.kg.mesure + g.summary.kg.estime + g.summary.kg.non_couvert)} perdus` }));
  if (data.byCategory.length) {
    pdf.heading("Par catégorie de produit", barsHeight(data.byCategory.length));
    pdf.bars(co2Bars(data.byCategory));
  }
  if (data.byDestination.length) {
    pdf.heading("Par devenir", barsHeight(data.byDestination.length));
    pdf.bars(co2Bars(data.byDestination));
  }
  if (data.byProduct.length) {
    pdf.heading("Produits qui pèsent le plus", barsHeight(data.byProduct.length));
    pdf.bars(co2Bars(data.byProduct.slice(0, 10)));
  }
  if (data.series.length) {
    pdf.heading("Les 12 dernières semaines", tableHeight(data.series.length));
    pdf.table(
      [
        { header: "Semaine", width: 1 },
        { header: "CO2e", width: 1.2, align: "right" },
        { header: "dont estimé", width: 1.2, align: "right" },
        { header: "Kg mesurés", width: 1, align: "right" },
        { header: "Kg estimés", width: 1, align: "right" },
        { header: "Kg non couverts", width: 1.2, align: "right" },
      ],
      data.series.map((w) => [formatProductionWeek(w), co2(w.summary.co2eKg), co2(w.summary.co2ByMethod.estime), kg(w.summary.kg.mesure), kg(w.summary.kg.estime), kg(w.summary.kg.non_couvert)]),
    );
  }

  pdf.heading("Rapprochement avec Les Alchimistes", tableHeight(13) + 40);
  if (!canReadReconciliation(user)) pdf.paragraph("Réservé aux vues d'entreprise (production, direction, administration).", { muted: true });
  else if (!anchor) pdf.paragraph("Semaine absente du calendrier.", { muted: true });
  else {
    const rec = await alchimistesReconciliation(db, user, anchor);
    if (!rec) pdf.paragraph("Semaine absente du calendrier.", { muted: true });
    else {
      pdf.paragraph(
        "Kg déclarés vers Les Alchimistes comparés aux kg qu'ils ont pesés, par semaine de production, toute l'entreprise. Le poids pesé est une mesure de contrôle, jamais ajouté aux pertes ; un écart n'est pas une erreur (collecte le jeudi d'un bac rempli le mercredi, épluchures non déclarées).",
        { muted: true, size: 8.5 },
      );
      const gap = (x: { gapKg: number | null; gapRate: number | null }) => (x.gapKg == null ? "—" : `${x.gapKg > 0 ? "+" : ""}${kg(x.gapKg)}${x.gapRate != null ? ` (${pct.format(x.gapRate)})` : ""}`);
      pdf.table(
        [
          { header: "Semaine", width: 1 },
          { header: "Déclaré", width: 1, align: "right" },
          { header: "Pesé", width: 1, align: "right" },
          { header: "Bacs", width: 0.6, align: "right" },
          { header: "Écart (pesé - déclaré)", width: 1.6, align: "right" },
          { header: "État", width: 1.8 },
        ],
        rec.weeks.map((w) => [w.label, kg(w.declaredKg), w.status === "sans_fichier" ? "—" : kg(w.measuredKg), w.status === "sans_fichier" ? "—" : String(w.bins), gap(w), RECONCILIATION_STATUS_LABELS[w.status]]),
        { total: [`Total (${rec.weeksTotal.periods})`, kg(rec.weeksTotal.declaredKg), kg(rec.weeksTotal.measuredKg), String(rec.weeksTotal.bins), gap(rec.weeksTotal), ""] },
      );
    }
  }
  pdf.paragraph("Chaque perte prend la version du facteur en vigueur à sa date : une nouvelle valeur ne change pas l'impact des pertes passées.", { muted: true, size: 8.5 });
  return { pdf, name: fileName("rapport-environnemental", label) };
}

/** Rapport PDF demandé ; null si la période ne s'y prête pas (semaine absente du calendrier). */
export async function buildReport(db: Db, user: AuthUser, type: ReportType, ctx: StatsContext, now = new Date()): Promise<{ bytes: Uint8Array; name: string } | null> {
  const generatedAt = toProductionLocalDate(now).split("-").reverse().join("/");
  let title = "";
  let subtitle = "";
  const setTitle = (t: string, sub: string) => {
    title = t;
    subtitle = sub;
  };
  const open = () => ReportPdf.create(title, subtitle, generatedAt);
  const today = ctx.today;
  let result: { pdf: ReportPdf; name: string } | null;
  switch (type) {
    case "hebdomadaire":
      result = await weekly(db, user, ctx, open, setTitle);
      break;
    case "mensuel": {
      const p = ctx.period;
      const month = p.kind === "mois" ? p : { kind: "mois" as const, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
      result = await periodic(db, user, ctx, month, open, setTitle);
      break;
    }
    case "annuel": {
      const p = ctx.period;
      const year = p.kind === "annee" ? p : { kind: "annee" as const, year: p.kind === "periode" ? Number(p.to.slice(0, 4)) : p.year };
      result = await periodic(db, user, ctx, year, open, setTitle);
      break;
    }
    case "valorisation":
      result = await recovery(db, user, ctx, open, setTitle);
      break;
    case "environnemental":
      result = await environment(db, user, ctx, open, setTitle);
      break;
  }
  if (!result) return null;
  return { bytes: await result.pdf.save(), name: result.name };
}
