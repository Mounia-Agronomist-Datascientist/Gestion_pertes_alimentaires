/**
 * Export d'un onglet des statistiques en CSV ou en classeur Excel (docs/PHASE4.md, étape 4.8) : mêmes droits,
 * même période et mêmes filtres que l'écran (`?onglet=zones&format=xlsx&periode=…`).
 */
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { tablesToCsv } from "@/domain/csv";
import { getCurrentUser } from "@/modules/auth/next-session";
import { statsContext } from "@/modules/statistiques/context";
import { EXPORT_TABS, type ExportTab, statsExport } from "@/modules/statistiques/exports";
import { canReadStats } from "@/modules/statistiques/facts";
import { tablesToXlsx } from "@/modules/statistiques/xlsx";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canReadStats(user)) return new NextResponse("Accès refusé", { status: 403 });
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const tab = (EXPORT_TABS as readonly string[]).includes(params.onglet ?? "") ? (params.onglet as ExportTab) : null;
  if (!tab) return new NextResponse("Onglet inconnu", { status: 400 });
  const ctx = await statsContext(db, user, params);
  const result = await statsExport(db, user, tab, ctx, params);
  if (!result) return new NextResponse("Rien à exporter", { status: 404 });
  const xlsx = params.format === "xlsx";
  const body = xlsx ? await tablesToXlsx(result.tables) : tablesToCsv(result.tables);
  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.name}.${xlsx ? "xlsx" : "csv"}"`,
      "Cache-Control": "no-store",
    },
  });
}
