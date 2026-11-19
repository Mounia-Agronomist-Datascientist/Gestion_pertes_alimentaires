/**
 * Synthèse des coûts d'une semaine de production (docs/PHASE3.md, étape 3.7 ; cahier des charges §18.6-18.7) :
 * coût brut par composante, recettes encaissées, coût net, par zone et par équipe. Les déclarations annulées
 * sont exclues ; une perte sans coût connu (hors liste, référentiel sans coût) est comptée à part, jamais estimée.
 * Seulement les zones cochées du compte ; la part renvoyée au fournisseur n'est pas comptée (décision du 19/11/2026).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { roundQuantity } from "@/domain/nombres";
import { SUPPLIER_RETURN_KIND } from "@/domain/retours-fournisseur";
import { type AuthUser, requirePermission } from "@/modules/auth/permissions";
import { zonesCondition } from "@/modules/declarations/queries";

export interface CostTotals {
  materialEur: number;
  packagingEur: number;
  labourEur: number;
  indirectEur: number;
  grossEur: number;
  recoveredEur: number;
  netEur: number;
}

const empty = (): CostTotals => ({
  materialEur: 0,
  packagingEur: 0,
  labourEur: 0,
  indirectEur: 0,
  grossEur: 0,
  recoveredEur: 0,
  netEur: 0,
});

/**
 * Coût brut d'une déclaration : celui figé à la saisie ; pour une perte saisie avant le coût brut (Phase 2), son
 * coût matière. Le net est toujours recalculé « brut − recettes » pour rester cohérent avec les colonnes affichées.
 */
const grossOf = (d: typeof s.lossDeclarations.$inferSelect) => d.grossCostEur ?? d.materialCostEur;

/** `kept` : part de la perte comptée (sans la part renvoyée au fournisseur, décision du 19/11/2026). */
function add(totals: CostTotals, d: typeof s.lossDeclarations.$inferSelect, kept: number) {
  const gross = (grossOf(d) ?? 0) * kept;
  const recovered = d.recoveredEur ?? 0;
  totals.materialEur += (d.materialCostEur ?? 0) * kept;
  totals.packagingEur += (d.packagingCostEur ?? 0) * kept;
  totals.labourEur += (d.labourCostEur ?? 0) * kept;
  totals.indirectEur += (d.indirectCostEur ?? 0) * kept;
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
      .where(
        and(
          eq(s.lossDeclarations.productionWeekId, productionWeekId),
          inArray(s.lossDeclarations.status, ["validee", "corrigee"]),
          zonesCondition(user) ?? sql`false`,
        ),
      ),
    db.select({ id: s.zones.id, name: s.zones.name, order: s.zones.displayOrder }).from(s.zones),
    db
      .select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName, order: s.teams.displayOrder })
      .from(s.teams),
  ]);

  // Part renvoyée au fournisseur de chaque perte (dernière version des destinations) : hors du total perdu.
  const lines = rows.length
    ? await db
        .select({
          declarationId: s.declarationDestinations.declarationId,
          revision: s.declarationDestinations.revision,
          kind: s.destinations.kind,
          quantity: s.declarationDestinations.quantity,
        })
        .from(s.declarationDestinations)
        .innerJoin(s.destinations, eq(s.destinations.id, s.declarationDestinations.destinationId))
        .where(
          inArray(
            s.declarationDestinations.declarationId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const revisionOf = new Map(rows.map((r) => [r.id, r.revision]));
  const split = new Map<string, { all: number; back: number }>();
  for (const l of lines) {
    if (revisionOf.get(l.declarationId) !== l.revision) continue;
    const q = split.get(l.declarationId) ?? split.set(l.declarationId, { all: 0, back: 0 }).get(l.declarationId)!;
    q.all += l.quantity;
    if (l.kind === SUPPLIER_RETURN_KIND) q.back += l.quantity;
  }
  const keptOf = (id: string) => {
    const q = split.get(id);
    return q && q.all > 0 ? 1 - q.back / q.all : 1;
  };

  const totals = empty();
  const byZone = new Map<string, CostTotals>();
  const byTeam = new Map<string, CostTotals>();
  let valued = 0;
  let packagingIncomplete = 0;
  let kg = 0;
  for (const d of rows) {
    const kept = keptOf(d.id);
    if (kept <= 0) continue;
    kg += (d.netKg ?? 0) * kept;
    if (grossOf(d) == null && d.recoveredEur == null) continue;
    valued++;
    if ((d.costDetails as { packagingComplete?: boolean | null } | null)?.packagingComplete === false)
      packagingIncomplete++;
    add(totals, d, kept);
    add(byZone.get(d.zoneId) ?? byZone.set(d.zoneId, empty()).get(d.zoneId)!, d, kept);
    if (d.teamId) add(byTeam.get(d.teamId) ?? byTeam.set(d.teamId, empty()).get(d.teamId)!, d, kept);
  }

  const counted = rows.filter((d) => keptOf(d.id) > 0).length;
  return {
    declarations: counted,
    valued,
    notValued: counted - valued,
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
