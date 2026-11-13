/**
 * Tableau de bord environnemental (docs/PHASE5.md, étape 5.6) : kg perdus et leur impact CO2e, séparés en
 * mesuré (recette Melba), estimé (perte hors tome, par la famille de son libellé) et non couvert. Mêmes droits
 * et filtres que les autres onglets ; les emballages et moules (non alimentaires) ne sont jamais comptés.
 *
 * Le CO2e n'est pas un bilan carbone de l'entreprise : seulement la production des denrées perdues (§20.3).
 */
import { inArray, isNotNull } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { type Co2Method, composition, coverage, estimatedLoss, factorAt, type FactorVersion, type IngredientFactor, type LossCo2, measuredLoss, type RecipeLine, type SubRecipeData } from "@/domain/co2e";
import { gramsOf } from "@/domain/couts";
import { suggestFamily } from "@/domain/ingredients-familles";
import type { Period } from "@/domain/periodes";
import { productLabel } from "@/domain/produits";
import type { LossFact } from "@/domain/statistiques";
import type { AuthUser } from "@/modules/auth/permissions";
import { tomeKey } from "@/modules/imports/tome/parse-tome";
import { recentWeeks } from "./evolution";
import { loadFacts, type StatsFilters } from "./facts";

export interface Co2Fact {
  fact: LossFact;
  co2: LossCo2;
}

const toLine = (l: typeof s.weekRecipeLines.$inferSelect): RecipeLine => ({
  key: l.key,
  isSubRecipe: l.isSubRecipe,
  componentSubRecipeId: l.componentSubRecipeId,
  quantity: l.quantity,
  unit: l.unit,
  unitWeightG: l.unitWeightG,
});

/** CO2e de chaque perte alimentaire de la période (pertes non alimentaires écartées). */
export async function loadCo2Facts(db: Db, user: AuthUser, period: Period, filters: StatsFilters = {}): Promise<{ facts: Co2Fact[]; nonFood: number; validFactors: number }> {
  const all = await loadFacts(db, user, period, filters);
  const food = all.filter((f) => f.food);
  const [versions, mappings, families] = await Promise.all([
    db.select().from(s.emissionFactors).where(isNotNull(s.emissionFactors.validatedAt)),
    db.select().from(s.ingredientFamilies),
    db.select({ id: s.foodFamilies.id, code: s.foodFamilies.code }).from(s.foodFamilies),
  ]);
  const result = { facts: [] as Co2Fact[], nonFood: all.length - food.length, validFactors: versions.filter((v) => v.status === "valide").length };
  if (!food.length) return result;

  // Produits du tome de chaque perte.
  const ids = food.map((f) => f.id);
  const links = new Map<string, { recipeId: string | null; subRecipeId: string | null; lineId: string | null }>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await db
      .select({ id: s.lossDeclarations.id, recipeId: s.lossDeclarations.weekRecipeId, subRecipeId: s.lossDeclarations.weekSubRecipeId, lineId: s.lossDeclarations.weekLineId })
      .from(s.lossDeclarations)
      .where(inArray(s.lossDeclarations.id, ids.slice(i, i + 1000)));
    for (const r of rows) links.set(r.id, r);
  }
  const recipeIds = [...new Set([...links.values()].map((l) => l.recipeId).filter((x): x is string => !!x))];
  const lineIds = [...new Set([...links.values()].map((l) => l.lineId).filter((x): x is string => !!x))];
  const [recipes, recipeLines, lossLines] = await Promise.all([
    recipeIds.length ? db.select().from(s.weekRecipes).where(inArray(s.weekRecipes.id, recipeIds)) : [],
    recipeIds.length ? db.select().from(s.weekRecipeLines).where(inArray(s.weekRecipeLines.recipeId, recipeIds)) : [],
    lineIds.length ? db.select().from(s.weekRecipeLines).where(inArray(s.weekRecipeLines.id, lineIds)) : [],
  ]);
  // Sous-recettes utilisées, déroulées sur 5 niveaux au plus.
  const subRecipes = new Map<string, SubRecipeData>();
  let pending = new Set([
    ...[...links.values()].map((l) => l.subRecipeId).filter((x): x is string => !!x),
    ...[...recipeLines, ...lossLines].map((l) => l.componentSubRecipeId).filter((x): x is string => !!x),
  ]);
  for (let depth = 0; pending.size && depth < 6; depth++) {
    const wanted = [...pending].filter((id) => !subRecipes.has(id));
    if (!wanted.length) break;
    const [subs, subLines] = await Promise.all([
      db.select().from(s.weekSubRecipes).where(inArray(s.weekSubRecipes.id, wanted)),
      db.select().from(s.weekRecipeLines).where(inArray(s.weekRecipeLines.subRecipeId, wanted)),
    ]);
    for (const sub of subs)
      subRecipes.set(sub.id, {
        lines: subLines.filter((l) => l.subRecipeId === sub.id).map(toLine),
        netQuantity: sub.netQuantity,
        netUnit: sub.netUnit,
        grossQuantity: sub.grossQuantity,
        grossUnit: sub.grossUnit,
      });
    pending = new Set(subLines.map((l) => l.componentSubRecipeId).filter((x): x is string => !!x && !subRecipes.has(x)));
  }

  // Facteur d'un ingrédient à une date : rattachement validé, puis version du facteur en vigueur à cette date.
  const versionsOf = new Map<string, FactorVersion[]>();
  for (const v of versions) (versionsOf.get(v.familyId) ?? versionsOf.set(v.familyId, []).get(v.familyId)!).push({ ...v, validatedAt: v.validatedAt! });
  const mappingOf = new Map(mappings.map((m) => [m.ingredientKey, m]));
  const familyByCode = new Map(families.map((f) => [f.code, f.id]));
  const familyFactor = (familyId: string | undefined, date: string): IngredientFactor => {
    const v = familyId ? factorAt(versionsOf.get(familyId) ?? [], date) : null;
    return v ? { kgCo2ePerKg: v.kgCo2ePerKg, factorId: v.id } : "non_couvert";
  };
  const ingredientFactor = (key: string, date: string): IngredientFactor => {
    const m = mappingOf.get(key);
    if (!m) return "non_couvert";
    if (m.status !== "famille") return m.status;
    return familyFactor(m.familyId!, date);
  };

  const recipeOf = new Map(recipes.map((r) => [r.id, r]));
  const linesOf = new Map<string, RecipeLine[]>();
  for (const l of recipeLines) (linesOf.get(l.recipeId!) ?? linesOf.set(l.recipeId!, []).get(l.recipeId!)!).push(toLine(l));
  const lossLineOf = new Map(lossLines.map((l) => [l.id, l]));
  const memo = new Map<string, { perUnit: number | null; perKg: number | null; coverage: number; factorIds: Set<string> } | null>();

  /** CO2e par portion / par kg d'un produit du tome à une date ; null si la perte n'est pas un produit du tome. */
  const productCo2 = (link: { recipeId: string | null; subRecipeId: string | null; lineId: string | null }, date: string) => {
    const memoKey = `${link.recipeId}|${link.subRecipeId}|${link.lineId}|${date}`;
    if (memo.has(memoKey)) return memo.get(memoKey)!;
    const factorOf = (key: string) => ingredientFactor(key, date);
    let value: { perUnit: number | null; perKg: number | null; coverage: number; factorIds: Set<string> } | null = null;
    const recipe = link.recipeId ? recipeOf.get(link.recipeId) : undefined;
    const subRecipeId = link.subRecipeId ?? (link.lineId ? lossLineOf.get(link.lineId)?.componentSubRecipeId : null) ?? null;
    if (recipe) {
      const c = composition(linesOf.get(recipe.id) ?? [], subRecipes, factorOf);
      const portionG = recipe.portionWeightG ?? recipe.totalWeightG;
      value = { perUnit: c.co2eKg, perKg: portionG ? (c.co2eKg / portionG) * 1000 : null, coverage: coverage(c), factorIds: c.factorIds };
    } else if (subRecipeId && subRecipes.has(subRecipeId)) {
      const sub = subRecipes.get(subRecipeId)!;
      const c = composition(sub.lines, subRecipes, factorOf);
      const grams = (sub.netQuantity && sub.netUnit ? gramsOf(sub.netQuantity, sub.netUnit) : null) || (sub.grossQuantity && sub.grossUnit ? gramsOf(sub.grossQuantity, sub.grossUnit) : null);
      value = { perUnit: null, perKg: grams ? (c.co2eKg / grams) * 1000 : null, coverage: coverage(c), factorIds: c.factorIds };
    } else if (link.lineId && lossLineOf.has(link.lineId)) {
      const line = lossLineOf.get(link.lineId)!;
      const f = ingredientFactor(line.key, date);
      const known = typeof f !== "string";
      value = {
        perUnit: known && line.unitWeightG ? (line.unitWeightG / 1000) * f.kgCo2ePerKg : null,
        perKg: known ? f.kgCo2ePerKg : null,
        coverage: known ? 1 : 0,
        factorIds: new Set(known ? [f.factorId] : []),
      };
    }
    memo.set(memoKey, value);
    return value;
  };

  for (const fact of food) {
    const link = links.get(fact.id) ?? { recipeId: null, subRecipeId: null, lineId: null };
    const product = productCo2(link, fact.occurredOn);
    let co2: LossCo2;
    if (product) co2 = measuredLoss({ netKg: fact.netKg, quantity: fact.netQuantity, unitCode: fact.netUnitCode }, product);
    else {
      // Hors tome : famille rattachée à son libellé, sinon suggestion par mot-clé (estimation signalée).
      const mapped = mappingOf.get(tomeKey(fact.productName));
      const suggestion = suggestFamily(fact.productName);
      const familyId = mapped ? (mapped.status === "famille" ? mapped.familyId! : undefined) : suggestion?.kind === "famille" ? familyByCode.get(suggestion.code) : undefined;
      const factor = familyFactor(familyId, fact.occurredOn);
      co2 = estimatedLoss(fact.netKg, typeof factor === "string" ? null : factor);
    }
    result.facts.push({ fact, co2 });
  }
  return result;
}

export interface Co2Summary {
  losses: number;
  co2eKg: number;
  co2ByMethod: Record<Exclude<Co2Method, "non_couvert">, number>;
  kg: Record<Co2Method, number>;
  /** Pertes alimentaires sans kg (non converties) : ni pesées, ni couvertes si leur unité ne se compte pas. */
  withoutKg: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function summarizeCo2(facts: readonly Co2Fact[]): Co2Summary {
  const s: Co2Summary = { losses: facts.length, co2eKg: 0, co2ByMethod: { mesure: 0, estime: 0 }, kg: { mesure: 0, estime: 0, non_couvert: 0 }, withoutKg: 0 };
  for (const { fact, co2 } of facts) {
    s.co2eKg += co2.co2eKg;
    if (co2.method !== "non_couvert") s.co2ByMethod[co2.method] += co2.co2eKg;
    s.kg.mesure += co2.kgMeasured;
    s.kg.estime += co2.kgEstimated;
    s.kg.non_couvert += co2.kgUncovered;
    if (fact.netKg == null) s.withoutKg++;
  }
  return {
    ...s,
    co2eKg: round(s.co2eKg),
    co2ByMethod: { mesure: round(s.co2ByMethod.mesure), estime: round(s.co2ByMethod.estime) },
    kg: { mesure: round(s.kg.mesure), estime: round(s.kg.estime), non_couvert: round(s.kg.non_couvert) },
  };
}

export interface Co2Group {
  key: string;
  label: string;
  summary: Co2Summary;
}

function groupBy(facts: readonly Co2Fact[], keyOf: (f: Co2Fact) => string, labelOf: (key: string, list: Co2Fact[]) => string): Co2Group[] {
  const groups = new Map<string, Co2Fact[]>();
  for (const f of facts) (groups.get(keyOf(f)) ?? groups.set(keyOf(f), []).get(keyOf(f))!).push(f);
  return [...groups]
    .map(([key, list]) => ({ key, label: labelOf(key, list), summary: summarizeCo2(list) }))
    .sort((a, b) => b.summary.co2eKg - a.summary.co2eKg || b.summary.kg.mesure + b.summary.kg.estime + b.summary.kg.non_couvert - (a.summary.kg.mesure + a.summary.kg.estime + a.summary.kg.non_couvert));
}

/** Répartit le CO2e et les kg d'une perte entre ses destinations, au prorata des quantités affectées. */
function byDestination(facts: readonly Co2Fact[]): Co2Fact[] {
  return facts.flatMap(({ fact, co2 }) => {
    const total = fact.destinations.reduce((a, d) => a + d.quantity, 0);
    if (!total) return [];
    return fact.destinations.map((d) => {
      const share = d.quantity / total;
      return {
        fact: { ...fact, netKg: fact.netKg == null ? null : fact.netKg * share, destinations: [d] },
        co2: { ...co2, co2eKg: co2.co2eKg * share, kgMeasured: co2.kgMeasured * share, kgEstimated: co2.kgEstimated * share, kgUncovered: co2.kgUncovered * share },
      };
    });
  });
}

export async function environmentDashboard(db: Db, user: AuthUser, period: Period, anchor: { year: number; number: number } | null, filters: StatsFilters, labels: { category: (c: string) => string; destinationKind: (k: string) => string }) {
  const [current, weeks] = await Promise.all([loadCo2Facts(db, user, period, filters), anchor ? recentWeeks(db, anchor, 12) : Promise.resolve(null)]);
  let series: { id: string; year: number; number: number; summary: Co2Summary }[] = [];
  if (weeks?.length) {
    const { facts } = await loadCo2Facts(db, user, { kind: "periode", from: weeks[0]!.startDate, to: weeks.at(-1)!.endDate }, filters);
    series = weeks.map((w) => ({ id: w.id, year: w.year, number: w.number, summary: summarizeCo2(facts.filter((f) => f.fact.productionWeekId === w.id)) }));
  }
  const facts = current.facts;
  return {
    summary: summarizeCo2(facts),
    nonFood: current.nonFood,
    validFactors: current.validFactors,
    byCategory: groupBy(facts, (f) => f.fact.category, (k) => labels.category(k)),
    byDestination: groupBy(byDestination(facts), (f) => f.fact.destinations[0]!.kind, (k) => labels.destinationKind(k)),
    byProduct: groupBy(facts, (f) => f.fact.productKey, (_, list) => productLabel(list[0]!.fact.productName, list[0]!.fact.productCode)).slice(0, 15),
    series,
  };
}
