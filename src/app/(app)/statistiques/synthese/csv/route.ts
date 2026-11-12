/**
 * Export CSV de la synthèse hebdomadaire (docs/PHASE4.md, étape 4.8) : les 12 dernières semaines, ou le détail
 * d'une semaine (zones, causes, produits). Mêmes droits et mêmes filtres que la page.
 */
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { toCsv } from "@/domain/csv";
import { parsePeriod } from "@/domain/periodes";
import { formatProductionWeek } from "@/domain/semaine-production";
import { getCurrentUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { PRODUCT_CATEGORIES } from "@/modules/declarations/input";
import { canReadStats, type StatsFilters } from "@/modules/statistiques/facts";
import { weeklySummary } from "@/modules/statistiques/weekly";

const UUID = /^[0-9a-f-]{36}$/i;
const kg = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canReadStats(user)) return new NextResponse("Accès refusé", { status: 403 });
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const period = parsePeriod(params);
  if (period?.kind !== "semaine") return new NextResponse("Semaine attendue", { status: 400 });
  const filters: StatsFilters = {
    zoneId: params.zone && UUID.test(params.zone) ? params.zone : undefined,
    teamId: can(user, "stats.compare_teams") && params.equipe && UUID.test(params.equipe) ? params.equipe : undefined,
    category: params.categorie && (PRODUCT_CATEGORIES as readonly string[]).includes(params.categorie) ? params.categorie : undefined,
  };
  const data = await weeklySummary(db, user, period, filters);
  if (!data) return new NextResponse("Semaine absente du calendrier", { status: 404 });
  const { withCosts } = data;
  const week = formatProductionWeek(period);

  let csv: string;
  let name: string;
  if (params.type === "detail") {
    const unit = data.by === "cout" ? "Coût brut (€)" : "Kg";
    const lines = [
      ...data.byZone.map((r) => ["Zone", r] as const),
      ...data.byCause.map((r) => ["Cause", r] as const),
      ...data.byProduct.map((r) => ["Produit", r] as const),
    ];
    csv = toCsv(
      ["Semaine", "Type", "Libellé", unit, "Part de la semaine (%)", `${unit} semaine précédente`, "Écart", "Pertes", "Kg alimentaires"],
      lines.map(([kind, r]) => [week, kind, r.label, r.value, Math.round(r.share * 1000) / 10, r.previous, r.delta, r.summary.events, kg(r.summary.foodKg)]),
    );
    name = `synthese-${week}-detail.csv`;
  } else {
    csv = toCsv(
      [
        "Semaine",
        "Kg alimentaires",
        "Barquettes perdues",
        "Pertes",
        ...(withCosts ? ["Coût brut (€)", "Recettes (€)", "Coût net (€)"] : []),
        "Barquettes prévues",
        "Barquettes produites",
        "Kg pour 1 000 barquettes prévues",
        "Kg pour 1 000 barquettes produites",
      ],
      data.comparison.series.map((p) => [
        formatProductionWeek(p),
        kg(p.summary.foodKg),
        p.summary.barquettes,
        p.summary.events,
        ...(withCosts ? [p.summary.cost?.grossEur ?? 0, p.summary.cost?.recoveredEur ?? 0, p.summary.cost?.netEur ?? 0] : []),
        p.planned?.barquettes ?? null,
        p.actual?.barquettes ?? null,
        p.perThousand,
        p.perThousandActual,
      ]),
    );
    name = `synthese-${week}-12-semaines.csv`;
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
