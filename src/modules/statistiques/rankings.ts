/**
 * Classements des produits, des causes et des destinations (docs/PHASE4.md, étape 4.4 ; cahier des charges
 * §19.4, §19.5).
 *
 * - Un plat se suit par sa **formule** (code Melba, ex. VI01) : sur plusieurs semaines, les plats différents d'une
 *   même formule sont regroupés et leurs noms listés.
 * - Une sous-recette, sans code Melba, se suit par son **nom normalisé** (identification « au mieux ») ; elle
 *   est comptée une seule fois même si elle sert à plusieurs plats, et ces plats sont indiqués.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { Period } from "@/domain/periodes";
import { destinationTotals, type LossFact, type RankBy, rankGroups, type StatsSummary } from "@/domain/statistiques";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { loadFacts, type StatsFilters } from "./facts";

/** Familles de produits proposées dans le classement. */
export const PRODUCT_TYPES = {
  plats: { label: "Plats", categories: ["recette", "produit_fini"] },
  sous_recettes: { label: "Sous-recettes", categories: ["sous_recette"] },
  matieres: { label: "Matières premières", categories: ["matiere_premiere"] },
  autres: { label: "Encas, emballages, moules", categories: ["produit_externe", "consommable", "moule_plat_gratin"] },
  tous: { label: "Tous", categories: null },
} as const;
export type ProductType = keyof typeof PRODUCT_TYPES;

export const RANK_BY_LABELS: Record<RankBy, string> = { kg: "En kg", cout: "En coût", evenements: "En nombre de pertes" };

/** Cause qui pèse le plus (en kg, puis en nombre de pertes) dans un groupe de pertes. */
function mainCause(facts: readonly LossFact[]): { name: string; share: number } | null {
  const ranked = rankGroups(facts, (f) => f.causeId, false);
  const top = ranked[0];
  if (!top) return null;
  const name = facts.find((f) => f.causeId === top.key)!.causeName;
  const total = ranked.reduce((a, g) => a + (g.summary.foodKg || 0), 0);
  return { name, share: total > 0 ? top.summary.foodKg / total : top.summary.events / facts.length };
}

export interface ProductRow {
  key: string;
  label: string;
  category: string;
  /** Noms des plats d'une même formule sur la période (plusieurs semaines). */
  names: string[];
  summary: StatsSummary;
  mainCause: { name: string; share: number } | null;
  /** Plats de la semaine qui utilisent la sous-recette (codes Melba). */
  usedIn: string[] | null;
}

export async function productRanking(db: Db, user: AuthUser, period: Period, filters: StatsFilters, type: ProductType, by: RankBy) {
  const withCosts = can(user, "indicators.read");
  const categories = PRODUCT_TYPES[type].categories as readonly string[] | null;
  const facts = (await loadFacts(db, user, period, filters)).filter((f) => !categories || categories.includes(f.category));
  const groups = new Map<string, LossFact[]>();
  for (const f of facts) (groups.get(f.productKey) ?? groups.set(f.productKey, []).get(f.productKey)!).push(f);

  // Plats qui utilisent chaque sous-recette de la semaine (directement dans leur composition).
  const subIds = [...new Set(facts.map((f) => f.weekSubRecipeId).filter((x): x is string => !!x))];
  const usedBy = new Map<string, Set<string>>();
  if (subIds.length) {
    const lines = await db
      .select({ subRecipeId: s.weekRecipeLines.componentSubRecipeId, code: s.weekRecipes.code })
      .from(s.weekRecipeLines)
      .innerJoin(s.weekRecipes, eq(s.weekRecipes.id, s.weekRecipeLines.recipeId))
      .where(and(inArray(s.weekRecipeLines.componentSubRecipeId, subIds), isNotNull(s.weekRecipeLines.recipeId)));
    for (const l of lines) if (l.subRecipeId) (usedBy.get(l.subRecipeId) ?? usedBy.set(l.subRecipeId, new Set()).get(l.subRecipeId)!).add(l.code);
  }

  const rows: ProductRow[] = rankGroups(facts, (f) => f.productKey, withCosts, by).map((g) => {
    const list = groups.get(g.key)!;
    const first = list[0]!;
    const names = [...new Set(list.map((f) => f.productName))];
    const codes = new Set<string>();
    for (const f of list) if (f.weekSubRecipeId) for (const c of usedBy.get(f.weekSubRecipeId) ?? []) codes.add(c);
    return {
      key: g.key,
      label: first.productCode ? (names.length > 1 ? `${first.productCode} (formule)` : `${first.productCode} – ${first.productName}`) : first.productName,
      category: first.category,
      names: names.length > 1 ? names : [],
      summary: g.summary,
      mainCause: mainCause(list),
      usedIn: first.category === "sous_recette" ? [...codes].sort() : null,
    };
  });
  return { withCosts, rows, total: facts.length };
}

/** Classement des causes (§19.5) et totaux par destination. */
export async function causeAndDestinationRanking(db: Db, user: AuthUser, period: Period, filters: StatsFilters, by: RankBy) {
  const withCosts = can(user, "indicators.read");
  const facts = await loadFacts(db, user, period, filters);
  const causes = rankGroups(facts, (f) => f.causeId, withCosts, by).map((g) => {
    const list = facts.filter((f) => f.causeId === g.key);
    const zones = rankGroups(list, (f) => f.zoneId, false);
    return { ...g, label: list[0]!.causeName, mainZoneId: zones[0]?.key ?? null };
  });
  const totals = destinationTotals(facts);
  const names = totals.size
    ? await db.select({ id: s.destinations.id, name: s.destinations.name }).from(s.destinations).where(inArray(s.destinations.id, [...totals.keys()]))
    : [];
  const nameOf = new Map(names.map((d) => [d.id, d.name]));
  const destinations = [...totals]
    .map(([id, t]) => ({ id, name: nameOf.get(id) ?? "—", ...t }))
    .sort((a, b) => b.foodKg - a.foodKg || b.events - a.events);
  const zoneNames = new Map((await db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones)).map((z) => [z.id, z.name]));
  return {
    withCosts,
    total: facts.length,
    causes: causes.map((c) => ({ ...c, mainZone: c.mainZoneId ? (zoneNames.get(c.mainZoneId) ?? null) : null })),
    destinations,
  };
}
