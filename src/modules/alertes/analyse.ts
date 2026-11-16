/**
 * Alertes d'analyse (docs/PHASE6.md, étapes 6.2 et 6.3) : pertes inhabituelles par équipe, zone et plat, et causes
 * récurrentes par équipe et plat, calculées la nuit pour chaque semaine de production terminée. L'évaluation est idempotente : une semaine est recalculée tant
 * qu'elle reste dans la période revue (corrections tardives) ; une alerte qui ne se vérifie plus disparaît tant
 * qu'elle n'a pas été vue.
 */
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type CauseWeight, recurringCause } from "@/domain/causes-recurrentes";
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

/** Alerte calculée, prête à enregistrer. */
interface Detected {
  kind: "perte_inhabituelle" | "cause_recurrente";
  scope: "equipe" | "zone" | "plat";
  subjectKey: string;
  teamId: string | null;
  label: string;
  measure: string | null;
  value: number | null;
  reference: number | null;
  rate: number | null;
  referenceWeeks: number | null;
  details: Record<string, unknown>;
}

/** Plats de la semaine : pertes déclarées sur le plat lui-même (code Melba). */
const isDish = (f: LossFact) => f.category === "produit_fini" && f.productCode != null;

/** Pertes, production, équipes et zones des semaines utiles à l'analyse d'une semaine terminée. */
async function loadAnalysis(db: Db, week: Week, size: number) {
  const window = (await recentWeeks(db, { year: week.year, number: week.number }, size)) ?? [];
  const ids = window.map((w) => w.id);
  const [facts, production, teams, zones] = await Promise.all([
    window.length ? loadFacts(db, SYSTEM_READER, { kind: "periode", from: window[0]!.startDate, to: week.endDate }) : Promise.resolve([]),
    productionOf(db, ids),
    db.select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName }).from(s.teams),
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones),
  ]);
  const byWeek = new Map(ids.map((id) => [id, facts.filter((f) => f.productionWeekId === id)]));
  const current = byWeek.get(week.id) ?? [];
  const teamLabel = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team ? `Équipe ${team.letter} – ${team.colorName}` : "Équipe";
  };
  const dishMeta = (code: string) => {
    const recipe = production.recipe(week.id, code);
    return { teamId: recipe?.teamId ?? null, label: productLabel(recipe?.name ?? current.find((f) => f.productCode === code)!.productName, code) };
  };
  return { window, byWeek, current, production, zones, teamLabel, dishMeta };
}
type Analysis = Awaited<ReturnType<typeof loadAnalysis>>;

/** Pertes inhabituelles d'une semaine terminée. `startDate` : mise en service ; les semaines d'avant ne servent pas de référence. */
function detectUnusualLosses(a: Analysis, week: Week, startDate: LocalDate, settings: AlertSettings): Detected[] {
  const { byWeek, current, production } = a;
  const history = a.window.filter((w) => w.id !== week.id).slice(-REFERENCE_WEEKS);
  const inUse = (w: Week) => w.startDate >= startDate;
  const detected: Detected[] = [];
  const check = (scope: Detected["scope"], subjectKey: string, select: (f: LossFact) => boolean, unit: (w: Week) => Omit<UnitWeek, "kg">, meta: { teamId: string | null; label: string }) => {
    const weekOf = (w: Week): UnitWeek => ({ kg: foodKg((byWeek.get(w.id) ?? []).filter(select)), ...unit(w) });
    const result: UnusualResult | null = checkUnusual(weekOf(week), history.map(weekOf), settings);
    if (result) detected.push({ kind: "perte_inhabituelle", scope, subjectKey, ...meta, ...result, details: context(current.filter(select)) });
  };
  for (const teamId of new Set(current.map((f) => f.teamId).filter((t): t is string => t != null))) {
    check("equipe", teamId, (f) => f.teamId === teamId, (w) => ({ produced: production.produced(w.id, { teamId }), active: inUse(w) && !production.teamInactive(w.id, teamId) }), {
      teamId,
      label: a.teamLabel(teamId),
    });
  }
  for (const zoneId of new Set(current.map((f) => f.zoneId))) {
    // Les zones ne produisent pas de barquettes : leur volume est celui de toute l'entreprise.
    check("zone", zoneId, (f) => f.zoneId === zoneId, (w) => ({ produced: production.produced(w.id), active: inUse(w) }), {
      teamId: null,
      label: a.zones.find((z) => z.id === zoneId)?.name ?? "Zone",
    });
  }
  for (const code of new Set(current.filter(isDish).map((f) => f.productCode!))) {
    check("plat", code, (f) => isDish(f) && f.productCode === code, (w) => ({ produced: production.produced(w.id, { code }), active: inUse(w) && production.dishMade(w.id, code) }), a.dishMeta(code));
  }
  return detected;
}

/** Poids de chaque cause dans des pertes. */
function causeWeights(facts: readonly LossFact[]): CauseWeight[] {
  const acc = new Map<string, CauseWeight>();
  for (const f of facts) {
    const row = acc.get(f.causeId) ?? acc.set(f.causeId, { causeId: f.causeId, causeName: f.causeName, kg: 0, events: 0 }).get(f.causeId)!;
    row.events++;
    if (f.food && f.netKg != null) row.kg = Math.round((row.kg + f.netKg) * 1000) / 1000;
  }
  return [...acc.values()];
}

/**
 * Causes récurrentes d'une semaine terminée : même cause en tête des pertes d'une équipe (semaines consécutives)
 * ou d'un plat (ses dernières semaines de production) pendant `recurrenceWeeks` semaines, toutes en service.
 */
function detectRecurringCauses(a: Analysis, week: Week, startDate: LocalDate, settings: AlertSettings): Detected[] {
  const { byWeek, current, production } = a;
  const count = settings.recurrenceWeeks;
  const inUse = a.window.filter((w) => w.startDate >= startDate);
  const detected: Detected[] = [];
  const check = (scope: "equipe" | "plat", subjectKey: string, weeks: Week[], select: (f: LossFact) => boolean, meta: { teamId: string | null; label: string }) => {
    const found = recurringCause(weeks.map((w) => causeWeights((byWeek.get(w.id) ?? []).filter(select))), count);
    if (!found) return;
    const shown = weeks.slice(-count);
    detected.push({
      kind: "cause_recurrente",
      scope,
      subjectKey,
      ...meta,
      measure: "kg",
      value: found.weeks.at(-1)!.kg,
      reference: null,
      rate: null,
      referenceWeeks: count,
      details: {
        causeId: found.causeId,
        causeName: found.causeName,
        weeks: found.weeks.map((c, i) => {
          const total = foodKg((byWeek.get(shown[i]!.id) ?? []).filter(select));
          return { week: `S${String(shown[i]!.number).padStart(2, "0")}-${shown[i]!.year}`, kg: c.kg, events: c.events, share: total > 0 ? Math.round((c.kg / total) * 1000) / 1000 : null };
        }),
      },
    });
  };
  for (const teamId of new Set(current.map((f) => f.teamId).filter((t): t is string => t != null))) {
    check("equipe", teamId, inUse, (f) => f.teamId === teamId, { teamId, label: a.teamLabel(teamId) });
  }
  for (const code of new Set(current.filter(isDish).map((f) => f.productCode!))) {
    // Un plat ne revient pas chaque semaine : ses semaines de production, consécutives ou non.
    const made = inUse.filter((w) => w.id === week.id || production.dishMade(w.id, code));
    check("plat", code, made, (f) => isDish(f) && f.productCode === code, a.dishMeta(code));
  }
  return detected;
}

/** Semaines chargées pour l'analyse : 4 de référence, ou assez pour retrouver les semaines de production d'un plat. */
const ANALYSIS_WEEKS = 9;

/** Alertes d'analyse d'une semaine terminée (pertes inhabituelles et causes récurrentes). */
export async function detectWeekAlerts(db: Db, week: Week, startDate: LocalDate, settings: AlertSettings): Promise<Detected[]> {
  const a = await loadAnalysis(db, week, Math.max(ANALYSIS_WEEKS, settings.recurrenceWeeks + 1, REFERENCE_WEEKS + 1));
  if (!a.window.length) return [];
  return [...detectUnusualLosses(a, week, startDate, settings), ...detectRecurringCauses(a, week, startDate, settings)];
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
    const detected = await detectWeekAlerts(db, week, options.startDate, settings);
    const existing = await db.select().from(s.lossAlerts).where(eq(s.lossAlerts.productionWeekId, week.id));
    const same = (e: (typeof existing)[number], d: Detected) => e.kind === d.kind && e.scope === d.scope && e.subjectKey === d.subjectKey;
    for (const d of detected) {
      const { kind, scope, subjectKey, ...rest } = d;
      const values = { ...rest, updatedAt: now };
      const before = existing.find((e) => same(e, d));
      if (before) {
        await db.update(s.lossAlerts).set(values).where(eq(s.lossAlerts.id, before.id));
        result.updated++;
      } else {
        await db.insert(s.lossAlerts).values({ kind, productionWeekId: week.id, scope, subjectKey, detectedAt: now, ...values });
        result.created++;
      }
    }
    // Alertes qui ne se vérifient plus (pertes corrigées) : retirées tant qu'elles n'ont pas été vues.
    const stale = existing.filter((e) => e.seenAt == null && !detected.some((d) => same(e, d)));
    if (stale.length) {
      await db.delete(s.lossAlerts).where(and(inArray(s.lossAlerts.id, stale.map((e) => e.id)), isNull(s.lossAlerts.seenAt)));
      result.removed += stale.length;
    }
  }
  return result;
}
