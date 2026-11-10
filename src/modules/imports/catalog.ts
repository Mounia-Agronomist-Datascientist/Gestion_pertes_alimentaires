/**
 * Produits de la semaine proposés à la saisie (docs/PHASE2.md, étape 2.5) : plats → sous-recettes →
 * ingrédients, d'après l'import en vigueur de la semaine de production.
 * - équipes de cuisine : les plats de leur équipe (plan de production) ;
 * - encas (codes EN…, règle R9) : proposés en conditionnement, réception et stockage uniquement.
 */
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { dishUnitCost, ingredientUnitCost, mouldCostOf, subRecipeUnitCost, type UnitCost } from "@/domain/couts";
import type { PortionKind } from "@/modules/admin/packaging-labels";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import type { AuthUser } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { gramsToKg, isMouldLabel, isSnackCode } from "./merge";

export { SNACK_ZONE_CODES } from "./merge";

export type WeekItemKind = "plat" | "sous_recette" | "ingredient";

export interface CatalogLine {
  /** Ligne de composition (ingrédient) ; pour une sous-recette, son identifiant est dans `subRecipeId`. */
  id: string;
  label: string;
  subRecipeId: string | null;
  unitWeightG: number | null;
  /** Moule ou plat à gratin (catégorie « Moules et plats à gratin »). */
  mould: boolean;
  /** Coût de l'ingrédient d'après le tome (pour une sous-recette, voir la sous-recette). */
  cost: UnitCost;
}

export interface WeekCatalog {
  weekId: string;
  year: number;
  number: number;
  startDate: LocalDate;
  endDate: LocalDate;
  dishes: {
    id: string;
    code: string;
    name: string;
    teamId: string | null;
    snack: boolean;
    portionWeightG: number | null;
    /** Coût matières d'une portion, hors moules et plats à gratin. */
    cost: UnitCost;
    /** Moules et plats à gratin inclus dans le coût Melba d'une portion (comptés en emballages). */
    mouldPerPortionEur: number;
    /** Emballages du référentiel ajoutés par portion. */
    portionKind: PortionKind | null;
    lines: CatalogLine[];
  }[];
  subRecipes: Record<string, { id: string; name: string; mould: boolean; cost: UnitCost; lines: CatalogLine[] }>;
}

/** Retire la mention « (sous-recette) » d'un libellé de composition. */
export const displayLabel = (label: string) => label.replace(/\s*\(\s*sous[\s-]*recettes?\s*\)\s*/i, " ").trim();

/**
 * Catalogues de la semaine en cours et de la précédente (déclarations tardives, délai de 7 jours).
 * Un compte équipe ne reçoit que les plats de son équipe ; les autres comptes reçoivent tout.
 */
export async function weekCatalogs(db: Db, user: AuthUser, today: LocalDate): Promise<WeekCatalog[]> {
  const thisWeek = await findStoredProductionWeek(db, today);
  if (!thisWeek) return [];
  const previousWeek = await findStoredProductionWeek(db, addDays(thisWeek.startDate, -1));
  const catalogs: WeekCatalog[] = [];
  for (const week of [thisWeek, previousWeek].filter((w) => w != null)) {
    const [current] = await db
      .select()
      .from(s.weeklyImports)
      .where(and(eq(s.weeklyImports.productionWeekId, week.id), eq(s.weeklyImports.status, "validee")));
    if (!current) continue;
    const [recipes, subRecipes, lines] = await Promise.all([
      db.select().from(s.weekRecipes).where(eq(s.weekRecipes.importId, current.id)),
      db.select().from(s.weekSubRecipes).where(eq(s.weekSubRecipes.importId, current.id)),
      db.select().from(s.weekRecipeLines).where(eq(s.weekRecipeLines.importId, current.id)),
    ]);
    const toLine = (l: (typeof lines)[number]): CatalogLine => ({
      id: l.id,
      label: displayLabel(l.label),
      subRecipeId: l.componentSubRecipeId,
      unitWeightG: l.unitWeightG,
      mould: isMouldLabel(l.label),
      cost: ingredientUnitCost(l),
    });
    const linesOf = (owner: { recipeId?: string; subRecipeId?: string }) =>
      lines
        .filter((l) => (owner.recipeId ? l.recipeId === owner.recipeId : l.subRecipeId === owner.subRecipeId))
        .sort((a, b) => a.position - b.position)
        .map(toLine);

    const structure = importStructure(lines, subRecipes);
    const visible = recipes.filter((r) => (user.teamId ? r.teamId === user.teamId : true));
    const dishes = visible
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        teamId: r.teamId,
        snack: isSnackCode(r.code),
        portionWeightG: portionWeightG(r),
        ...dishCosts(r, structure),
        lines: linesOf({ recipeId: r.id }),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    // Sous-recettes accessibles depuis les plats proposés (y compris les sous-recettes de sous-recettes).
    const byId = new Map(subRecipes.map((sr) => [sr.id, sr]));
    const reachable: WeekCatalog["subRecipes"] = {};
    const queue = dishes.flatMap((d) => d.lines.map((l) => l.subRecipeId)).filter((id): id is string => !!id);
    while (queue.length) {
      const id = queue.pop()!;
      const sr = byId.get(id);
      if (!sr || reachable[id]) continue;
      reachable[id] = { id, name: sr.name, mould: isMouldLabel(sr.name), cost: subRecipeCost(sr), lines: linesOf({ subRecipeId: id }) };
      for (const l of reachable[id].lines) if (l.subRecipeId) queue.push(l.subRecipeId);
    }
    catalogs.push({ weekId: week.id, year: week.year, number: week.number, startDate: week.startDate, endDate: week.endDate, dishes, subRecipes: reachable });
  }
  return catalogs;
}

type LineRow = typeof s.weekRecipeLines.$inferSelect;
type SubRecipeRow = typeof s.weekSubRecipes.$inferSelect;

/** Compositions d'un import, pour retrouver les moules inclus dans le coût d'un plat. */
function importStructure(lines: readonly LineRow[], subRecipes: readonly SubRecipeRow[]) {
  const asLine = (l: LineRow) => ({ label: l.label, costEur: l.costEur, subRecipeId: l.componentSubRecipeId });
  return {
    linesOfRecipe: (recipeId: string) => lines.filter((l) => l.recipeId === recipeId).map(asLine),
    subRecipes: new Map(subRecipes.map((sr) => [sr.id, { totalCostEur: sr.totalCostEur, lines: lines.filter((l) => l.subRecipeId === sr.id).map(asLine) }])),
  };
}

/**
 * Coûts d'un plat : matières (coût Melba moins les moules et plats à gratin qu'il inclut) et emballages
 * (ces moules + emballages du référentiel par portion). Encas : produit acheté, sans emballage ajouté.
 */
function dishCosts(r: typeof s.weekRecipes.$inferSelect, structure: ReturnType<typeof importStructure>) {
  const snack = isSnackCode(r.code);
  const mould = snack ? 0 : mouldCostOf(structure.linesOfRecipe(r.id), structure.subRecipes, isMouldLabel);
  return {
    cost: dishUnitCost(r.totalCostEur != null ? Math.round((r.totalCostEur - mould) * 10_000) / 10_000 : null, portionWeightG(r)),
    mouldPerPortionEur: mould,
    portionKind: snack ? null : r.code.startsWith("PJ") ? ("petit_dejeuner" as const) : ("plat" as const),
  };
}

/** Coût d'une sous-recette rapporté à son poids net (à défaut, à sa quantité de référence en g ou kg). */
const subRecipeCost = (sr: { totalCostEur: number | null; netQuantity: number | null; netUnit: string | null; referenceQuantity: number | null; referenceUnit: string | null }) =>
  subRecipeUnitCost(
    sr.totalCostEur,
    sr.netQuantity != null && sr.netUnit
      ? { quantity: sr.netQuantity, unit: sr.netUnit }
      : sr.referenceQuantity != null && sr.referenceUnit
        ? { quantity: sr.referenceQuantity, unit: sr.referenceUnit }
        : null,
  );

/** Coûts d'une sous-recette ou d'un ingrédient : matières, ou emballage s'il s'agit d'un moule. */
const itemCost = (cost: UnitCost, mould: boolean): ResolvedWeekItem["cost"] => ({
  food: mould ? { perKgEur: null, perUnitEur: null } : cost,
  mouldPerPortionEur: null,
  portionKind: null,
  portionWeightKg: null,
  packagingItself: mould ? cost : null,
});

/** Poids d'une portion : celui du rendement (« (315.1 g) »), sinon la « Recette totale » d'une recette. */
const portionWeightG = (r: { portionWeightG: number | null; totalWeightG: number | null }) => r.portionWeightG ?? r.totalWeightG;

export interface ResolvedWeekItem {
  category: (typeof s.productCategoryEnum.enumValues)[number];
  name: string;
  code: string | null;
  unitWeightKg: number | null;
  refs: { weekRecipeId: string | null; weekSubRecipeId: string | null; weekLineId: string | null };
  importId: string;
  teamId: string | null;
  snack: boolean;
  /** Coûts du tome de la semaine (figés sur la déclaration). */
  cost: {
    /** Coût matières (hors moules et plats à gratin). */
    food: UnitCost;
    /** Moules inclus dans le coût Melba d'une portion de plat. */
    mouldPerPortionEur: number | null;
    /** Emballages du référentiel à ajouter par portion (plat, petit-déjeuner) ; null pour les autres produits. */
    portionKind: PortionKind | null;
    portionWeightKg: number | null;
    /** Le produit est lui-même un moule ou un plat à gratin : son coût va dans les emballages. */
    packagingItself: UnitCost | null;
  };
}

/** Retrouve un produit de la semaine choisi à la saisie, ou null s'il n'existe pas. */
export async function findWeekItem(db: Db, kind: WeekItemKind, id: string): Promise<ResolvedWeekItem | null> {
  const none = { weekRecipeId: null, weekSubRecipeId: null, weekLineId: null };
  if (kind === "plat") {
    const [r] = await db.select().from(s.weekRecipes).where(eq(s.weekRecipes.id, id));
    if (!r) return null;
    const snack = isSnackCode(r.code);
    const [lines, subRecipes] = await Promise.all([
      db.select().from(s.weekRecipeLines).where(eq(s.weekRecipeLines.importId, r.importId)),
      db.select().from(s.weekSubRecipes).where(eq(s.weekSubRecipes.importId, r.importId)),
    ]);
    const costs = dishCosts(r, importStructure(lines, subRecipes));
    return {
      // Un encas est un produit acheté ; un plat de la semaine, un produit fini (barquette).
      category: snack ? "produit_externe" : "produit_fini",
      name: r.name,
      code: r.code,
      // Hypothèse à valider (docs/POINTS_A_VALIDER.md) : une barquette (ou un encas) = une portion du tome. Le tome
      // raisonne pour une recette = une portion : sans poids de portion imprimé, on prend la « Recette totale ».
      unitWeightKg: gramsToKg(portionWeightG(r)),
      refs: { ...none, weekRecipeId: r.id },
      importId: r.importId,
      teamId: r.teamId,
      snack,
      cost: {
        food: costs.cost,
        mouldPerPortionEur: costs.mouldPerPortionEur,
        portionKind: costs.portionKind,
        portionWeightKg: gramsToKg(portionWeightG(r)),
        packagingItself: null,
      },
    };
  }
  if (kind === "sous_recette") {
    const [sr] = await db.select().from(s.weekSubRecipes).where(eq(s.weekSubRecipes.id, id));
    if (!sr) return null;
    return { category: isMouldLabel(sr.name) ? "moule_plat_gratin" : "sous_recette", name: sr.name, code: null, unitWeightKg: null, refs: { ...none, weekSubRecipeId: sr.id }, importId: sr.importId, teamId: null, snack: false, cost: itemCost(subRecipeCost(sr), isMouldLabel(sr.name)) };
  }
  const [l] = await db.select().from(s.weekRecipeLines).where(eq(s.weekRecipeLines.id, id));
  if (!l || l.isSubRecipe) return null;
  return {
    category: isMouldLabel(l.label) ? "moule_plat_gratin" : "matiere_premiere",
    name: displayLabel(l.label),
    code: null,
    unitWeightKg: gramsToKg(l.unitWeightG),
    refs: { ...none, weekLineId: l.id },
    importId: l.importId,
    teamId: null,
    snack: false,
    cost: itemCost(ingredientUnitCost(l), isMouldLabel(l.label)),
  };
}
