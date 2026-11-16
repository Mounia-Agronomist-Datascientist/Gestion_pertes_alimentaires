/**
 * Alertes d'analyse (docs/PHASE6.md, étape 6.2) : pertes inhabituelles par équipe, zone et plat, calculées la nuit
 * pour chaque semaine de production terminée. L'évaluation est idempotente : une semaine est recalculée tant
 * qu'elle reste dans la période revue (corrections tardives) ; une alerte qui ne se vérifie plus disparaît tant
 * qu'elle n'a pas été vue.
 */
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type AlertSettings, checkUnusual, DEFAULT_ALERT_SETTINGS, REFERENCE_WEEKS, type UnitWeek, type UnusualResult } from "@/domain/pertes-inhabituelles";
import { productLabel } from "@/domain/produits";
import { addDays, type LocalDate, toProductionLocalDate } from "@/domain/semaine-production";
import type { LossFact } from "@/domain/statistiques";
import type { AuthUser } from "@/modules/auth/permissions";
import { recentWeeks } from "@/modules/statistiques/evolution";
import { loadFacts } from "@/modules/statistiques/facts";

/** Semaines terminées revues à chaque évaluation (corrections faites dans le délai laissé aux équipes). */
const LOOKBACK_DAYS = 21;

/**
 * Lecteur interne des statistiques pour la tâche de nuit : toute l'entreprise, sans euros. Il n'existe pas en base
 * et ne sert qu'à lire les pertes.
 */
const SYSTEM_READER: AuthUser = {
  id: "00000000-0000-0000-0000-000000000000",
  login: "analyse-de-nuit",
  displayName: "Analyse de nuit",
  roleCode: "systeme",
  teamId: null,
  team: null,
  zoneIds: [],
  permissions: new Set(["stats.global", "stats.compare_teams"]),
  mustChangePassword: false,
};

export async function loadAlertSettings(db: Db): Promise<AlertSettings> {
  const [row] = await db.select().from(s.alertSettings).where(eq(s.alertSettings.id, 1));
  return row ? { unusualRate: row.unusualRate, minKg: row.minKg, recurrenceWeeks: row.recurrenceWeeks, trendStableRate: row.trendStableRate } : DEFAULT_ALERT_SETTINGS;
}

type Week = { id: string; year: number; number: number; startDate: string; endDate: string };

/** Production et plats de chaque semaine : barquettes produites par code, plats du plan et leur équipe. */
async function productionOf(db: Db, weekIds: string[]) {
  const [lines, recipes, inactive] = await Promise.all([
    db
      .select({ weekId: s.productionCounts.productionWeekId, code: s.productionCountLines.code, made: s.productionCountLines.madeBarquettes })
      .from(s.productionCountLines)
      .innerJoin(s.productionCounts, eq(s.productionCounts.id, s.productionCountLines.countId))
      .where(and(inArray(s.productionCounts.productionWeekId, weekIds), eq(s.productionCounts.status, "validee"))),
    db
      .select({ weekId: s.weeklyImports.productionWeekId, code: s.weekRecipes.code, name: s.weekRecipes.name, teamId: s.weekRecipes.teamId, barquettes: s.weekRecipes.weekBarquettes })
      .from(s.weekRecipes)
      .innerJoin(s.weeklyImports, eq(s.weeklyImports.id, s.weekRecipes.importId))
      .where(and(inArray(s.weeklyImports.productionWeekId, weekIds), eq(s.weeklyImports.status, "validee"))),
    db
      .select({ weekId: s.teamWeekStatus.productionWeekId, teamId: s.teamWeekStatus.teamId })
      .from(s.teamWeekStatus)
      .where(and(inArray(s.teamWeekStatus.productionWeekId, weekIds), eq(s.teamWeekStatus.active, false))),
  ]);
  const recipe = new Map(recipes.map((r) => [`${r.weekId}:${r.code}`, r]));
  const counted = new Set(lines.map((l) => l.weekId));
  return {
    /** Barquettes produites : toute l'entreprise, une équipe ou un code ; null sans « Décompte barquettes ». */
    produced(weekId: string, filter?: { teamId?: string; code?: string }): number | null {
      if (!counted.has(weekId)) return null;
      return lines
        .filter((l) => l.weekId === weekId && (!filter?.code || l.code === filter.code) && (!filter?.teamId || recipe.get(`${weekId}:${l.code}`)?.teamId === filter.teamId))
        .reduce((a, l) => a + l.made, 0);
    },
    /** Le plat est au plan de la semaine ou au décompte. */
    dishMade(weekId: string, code: string) {
      return (recipe.get(`${weekId}:${code}`)?.barquettes ?? 0) > 0 || lines.some((l) => l.weekId === weekId && l.code === code && l.made > 0);
    },
    recipe: (weekId: string, code: string) => recipe.get(`${weekId}:${code}`),
    teamInactive: (weekId: string, teamId: string) => inactive.some((x) => x.weekId === weekId && x.teamId === teamId),
  };
}

const foodKg = (facts: readonly LossFact[]) => facts.reduce((a, f) => a + (f.food && f.netKg != null ? f.netKg : 0), 0);

/** Les 3 causes et produits qui pèsent le plus dans les pertes de l'unité (contexte de l'alerte). */
function context(facts: readonly LossFact[]) {
  const top = (keyOf: (f: LossFact) => string, labelOf: (f: LossFact) => string) => {
    const acc = new Map<string, { label: string; kg: number }>();
    for (const f of facts) {
      if (!f.food || f.netKg == null) continue;
      const k = keyOf(f);
      const row = acc.get(k) ?? acc.set(k, { label: labelOf(f), kg: 0 }).get(k)!;
      row.kg += f.netKg;
    }
    return [...acc.values()]
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 3)
      .map((r) => ({ label: r.label, kg: Math.round(r.kg * 1000) / 1000 }));
  };
  return { causes: top((f) => f.causeId, (f) => f.causeName), products: top((f) => f.productKey, (f) => productLabel(f.productName, f.productCode)) };
}

interface Detected {
  scope: "equipe" | "zone" | "plat";
  subjectKey: string;
  teamId: string | null;
  label: string;
  result: UnusualResult;
  details: Record<string, unknown>;
}

/** Pertes inhabituelles d'une semaine terminée. `startDate` : mise en service ; les semaines d'avant ne servent pas de référence. */
export async function detectUnusualLosses(db: Db, week: Week, startDate: LocalDate, settings: AlertSettings): Promise<Detected[]> {
  const window = (await recentWeeks(db, { year: week.year, number: week.number }, REFERENCE_WEEKS + 1)) ?? [];
  if (!window.length) return [];
  const ids = window.map((w) => w.id);
  const [facts, production, teams, zones] = await Promise.all([
    loadFacts(db, SYSTEM_READER, { kind: "periode", from: window[0]!.startDate, to: week.endDate }),
    productionOf(db, ids),
    db.select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName }).from(s.teams),
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones),
  ]);
  const inUse = (w: Week) => w.startDate >= startDate;
  const byWeek = new Map(ids.map((id) => [id, facts.filter((f) => f.productionWeekId === id)]));
  const current = byWeek.get(week.id) ?? [];
  const history = window.filter((w) => w.id !== week.id);
  const detected: Detected[] = [];
  const check = (
    scope: Detected["scope"],
    subjectKey: string,
    select: (f: LossFact) => boolean,
    unit: (w: Week, facts: LossFact[]) => Omit<UnitWeek, "kg">,
    meta: { teamId: string | null; label: string },
  ) => {
    const mine = current.filter(select);
    const weekOf = (w: Week): UnitWeek => {
      const list = (byWeek.get(w.id) ?? []).filter(select);
      return { kg: foodKg(list), ...unit(w, list) };
    };
    const result = checkUnusual(weekOf(week), history.map(weekOf), settings);
    if (result) detected.push({ scope, subjectKey, ...meta, result, details: context(mine) });
  };

  for (const teamId of new Set(current.map((f) => f.teamId).filter((t): t is string => t != null))) {
    const team = teams.find((t) => t.id === teamId);
    check("equipe", teamId, (f) => f.teamId === teamId, (w) => ({ produced: production.produced(w.id, { teamId }), active: inUse(w) && !production.teamInactive(w.id, teamId) }), {
      teamId,
      label: team ? `Équipe ${team.letter} – ${team.colorName}` : "Équipe",
    });
  }
  for (const zoneId of new Set(current.map((f) => f.zoneId))) {
    // Les zones ne produisent pas de barquettes : leur volume est celui de toute l'entreprise.
    check("zone", zoneId, (f) => f.zoneId === zoneId, (w) => ({ produced: production.produced(w.id), active: inUse(w) }), {
      teamId: null,
      label: zones.find((z) => z.id === zoneId)?.name ?? "Zone",
    });
  }
  const isDish = (f: LossFact) => f.category === "produit_fini" && f.productCode != null;
  for (const code of new Set(current.filter(isDish).map((f) => f.productCode!))) {
    const recipe = production.recipe(week.id, code);
    const name = recipe?.name ?? current.find((f) => f.productCode === code)!.productName;
    check("plat", code, (f) => isDish(f) && f.productCode === code, (w) => ({ produced: production.produced(w.id, { code }), active: inUse(w) && production.dishMade(w.id, code) }), {
      teamId: recipe?.teamId ?? null,
      label: productLabel(name, code),
    });
  }
  return detected;
}

export interface AnalysisResult {
  weeks: number;
  created: number;
  updated: number;
  removed: number;
}

/**
 * Évalue les semaines terminées depuis la mise en service (ALERTES_DEBUT), dans la période revue. Sans date de
 * mise en service, rien n'est évalué.
 */
export async function evaluateLossAlerts(db: Db, options: { startDate: LocalDate | null; now?: Date }): Promise<AnalysisResult> {
  const result: AnalysisResult = { weeks: 0, created: 0, updated: 0, removed: 0 };
  if (!options.startDate) return result;
  const now = options.now ?? new Date();
  const today = toProductionLocalDate(now);
  const weeks = await db
    .select({ id: s.productionWeeks.id, year: s.productionWeeks.year, number: s.productionWeeks.number, startDate: s.productionWeeks.startDate, endDate: s.productionWeeks.endDate })
    .from(s.productionWeeks)
    .where(and(lt(s.productionWeeks.endDate, today), gte(s.productionWeeks.endDate, addDays(today, -LOOKBACK_DAYS)), gte(s.productionWeeks.startDate, options.startDate)));
  const settings = await loadAlertSettings(db);
  for (const week of weeks) {
    result.weeks++;
    const detected = await detectUnusualLosses(db, week, options.startDate, settings);
    const existing = await db.select().from(s.lossAlerts).where(and(eq(s.lossAlerts.kind, "perte_inhabituelle"), eq(s.lossAlerts.productionWeekId, week.id)));
    for (const d of detected) {
      const values = {
        teamId: d.teamId,
        label: d.label,
        measure: d.result.measure,
        value: d.result.value,
        reference: d.result.reference,
        rate: d.result.rate,
        referenceWeeks: d.result.referenceWeeks,
        details: d.details,
        updatedAt: now,
      };
      const before = existing.find((e) => e.scope === d.scope && e.subjectKey === d.subjectKey);
      if (before) {
        await db.update(s.lossAlerts).set(values).where(eq(s.lossAlerts.id, before.id));
        result.updated++;
      } else {
        await db.insert(s.lossAlerts).values({ kind: "perte_inhabituelle", productionWeekId: week.id, scope: d.scope, subjectKey: d.subjectKey, detectedAt: now, ...values });
        result.created++;
      }
    }
    // Alertes qui ne se vérifient plus (pertes corrigées) : retirées tant qu'elles n'ont pas été vues.
    const stale = existing.filter((e) => e.seenAt == null && !detected.some((d) => d.scope === e.scope && d.subjectKey === e.subjectKey));
    if (stale.length) {
      await db.delete(s.lossAlerts).where(and(inArray(s.lossAlerts.id, stale.map((e) => e.id)), isNull(s.lossAlerts.seenAt)));
      result.removed += stale.length;
    }
  }
  return result;
}
