/**
 * Rapport PDF des statistiques (docs/PHASE5.md, étape 5.7) : mêmes droits, même période et mêmes filtres que
 * l'écran (`?type=hebdomadaire&periode=…`).
 */
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { getCurrentUser } from "@/modules/auth/next-session";
import { buildReport, REPORT_TYPES, type ReportType } from "@/modules/rapports/reports";
import { statsContext } from "@/modules/statistiques/context";
import { canReadStats } from "@/modules/statistiques/facts";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canReadStats(user)) return new NextResponse("Accès refusé", { status: 403 });
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const type = (REPORT_TYPES as readonly string[]).includes(params.type ?? "") ? (params.type as ReportType) : null;
  if (!type) return new NextResponse("Rapport inconnu", { status: 400 });
  const ctx = await statsContext(db, user, params);
  const result = await buildReport(db, user, type, ctx);
  if (!result) return new NextResponse("Semaine absente du calendrier", { status: 404 });
  return new NextResponse(result.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
