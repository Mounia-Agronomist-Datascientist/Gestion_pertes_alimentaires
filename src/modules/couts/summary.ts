/**
 * Synthèse des coûts d'une semaine de production (docs/PHASE3.md, étape 3.7 ; cahier des charges §18.6-18.7) :
 * coût brut par composante, recettes encaissées, coût net, par zone et par équipe. Les déclarations annulées
 * sont exclues ; une perte sans coût connu (hors liste, référentiel sans coût) est comptée à part, jamais estimée.
 */
import { and, eq, inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { roundQuantity } from "@/domain/nombres";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";

export interface CostTotals {
  materialEur: number;
  packagingEur: number;
  labourEur: number;
  indirectEur: number;
  grossEur: number;
  recoveredEur: number;
  netEur: number;
}

const empty = (): CostTotals => ({ materialEur: 0, packagingEur: 0, labourEur: 0, indirectEur: 0, grossEur: 0, recoveredEur: 0, netEur: 0 });

/**
 * Coût brut d'une déclaration : celui figé à la saisie ; pour une perte saisie avant le coût brut (Phase 2), son
 * coût matière. Le net est toujours recalculé « brut − recettes » pour rester cohérent avec les colonnes affichées.
 */
const grossOf = (d: typeof s.lossDeclarations.$inferSelect) => d.grossCostEur ?? d.materialCostEur;

function add(totals: CostTotals, d: typeof s.lossDeclarations.$inferSelect) {
  const gross = grossOf(d) ?? 0;
  const recovered = d.recoveredEur ?? 0;
  totals.materialEur += d.materialCostEur ?? 0;
  totals.packagingEur += d.packagingCostEur ?? 0;
  totals.labourEur += d.labourCostEur ?? 0;
  totals.indirectEur += d.indirectCostEur ?? 0;
  totals.grossEur += gross;
  totals.recoveredEur += recovered;
  totals.netEur += gross - recovered;
}

const rounded = (t: CostTotals): CostTotals =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 100) / 100])) as unknown as CostTotals;

export async function weekCostSummary(db: Db, user: AuthUser, productionWeekId: string) {
  requirePermission(user, "indicators.read");
  const [rows, zones, teams] = await Promise.all([
    db
      .select()
      .from(s.lossDeclarations)
      .where(and(eq(s.lossDeclarations.productionWeekId, productionWeekId), inArray(s.lossDeclarations.status, ["validee", "corrigee"]))),
    db.select({ id: s.zones.id, name: s.zones.name, order: s.zones.displayOrder }).from(s.zones),
    db.select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName, order: s.teams.displayOrder }).from(s.teams),
  ]);

  const totals = empty();
  const byZone = new Map<string, CostTotals>();
  const byTeam = new Map<string, CostTotals>();
  let valued = 0;
  let packagingIncomplete = 0;
  let kg = 0;
  for (const d of rows) {
    kg += d.netKg ?? 0;
    if (grossOf(d) == null && d.recoveredEur == null) continue;
    valued++;
    if ((d.costDetails as { packagingComplete?: boolean | null } | null)?.packagingComplete === false) packagingIncomplete++;
    add(totals, d);
    add(byZone.get(d.zoneId) ?? byZone.set(d.zoneId, empty()).get(d.zoneId)!, d);
    if (d.teamId) add(byTeam.get(d.teamId) ?? byTeam.set(d.teamId, empty()).get(d.teamId)!, d);
  }

  return {
    declarations: rows.length,
    valued,
    notValued: rows.length - valued,
    packagingIncomplete,
    netKg: roundQuantity(kg),
    totals: rounded(totals),
    byZone: zones
      .filter((z) => byZone.has(z.id))
      .sort((a, b) => a.order - b.order)
      .map((z) => ({ id: z.id, name: z.name, ...rounded(byZone.get(z.id)!) })),
    byTeam: teams
      .filter((t) => byTeam.has(t.id))
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ id: t.id, letter: t.letter, colorName: t.colorName, ...rounded(byTeam.get(t.id)!) })),
  };
}

/** Composantes du coût brut, dans l'ordre d'affichage (couleurs fixes, §18.7). */
export const COST_COMPONENTS = [
  { key: "materialEur", label: "Matières premières" },
  { key: "labourEur", label: "Main-d'œuvre" },
  { key: "packagingEur", label: "Emballages" },
  { key: "indirectEur", label: "Charges indirectes" },
] as const;
