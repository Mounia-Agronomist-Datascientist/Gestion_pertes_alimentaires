/**
 * Produits de la semaine proposés à la saisie (docs/PHASE2.md, étape 2.5) : plats → sous-recettes →
 * ingrédients, d'après l'import en vigueur de la semaine de production.
 * - équipes de cuisine : les plats de leur équipe (plan de production) ;
 * - encas (codes EN…, règle R9) : proposés en conditionnement, réception et stockage uniquement.
 */
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays, type LocalDate } from "@/domain/semaine-production";
import type { AuthUser } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { gramsToKg, isSnackCode } from "./merge";

export { SNACK_ZONE_CODES } from "./merge";

export type WeekItemKind = "plat" | "sous_recette" | "ingredient";

export interface CatalogLine {
  /** Ligne de composition (ingrédient) ; pour une sous-recette, son identifiant est dans `subRecipeId`. */
  id: string;
  label: string;
  subRecipeId: string | null;
  unitWeightG: number | null;
}

export interface WeekCatalog {
  weekId: string;
  year: number;
  number: number;
  startDate: LocalDate;
  endDate: LocalDate;
  dishes: { id: string; code: string; name: string; teamId: string | null; snack: boolean; portionWeightG: number | null; lines: CatalogLine[] }[];
  subRecipes: Record<string, { id: string; name: string; lines: CatalogLine[] }>;
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
    });
    const linesOf = (owner: { recipeId?: string; subRecipeId?: string }) =>
      lines
        .filter((l) => (owner.recipeId ? l.recipeId === owner.recipeId : l.subRecipeId === owner.subRecipeId))
        .sort((a, b) => a.position - b.position)
        .map(toLine);

    const visible = recipes.filter((r) => (user.teamId ? r.teamId === user.teamId : true));
    const dishes = visible
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        teamId: r.teamId,
        snack: isSnackCode(r.code),
        portionWeightG: portionWeightG(r),
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
      reachable[id] = { id, name: sr.name, lines: linesOf({ subRecipeId: id }) };
      for (const l of reachable[id].lines) if (l.subRecipeId) queue.push(l.subRecipeId);
    }
    catalogs.push({ weekId: week.id, year: week.year, number: week.number, startDate: week.startDate, endDate: week.endDate, dishes, subRecipes: reachable });
  }
  return catalogs;
}

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
}

/** Retrouve un produit de la semaine choisi à la saisie, ou null s'il n'existe pas. */
export async function findWeekItem(db: Db, kind: WeekItemKind, id: string): Promise<ResolvedWeekItem | null> {
  const none = { weekRecipeId: null, weekSubRecipeId: null, weekLineId: null };
  if (kind === "plat") {
    const [r] = await db.select().from(s.weekRecipes).where(eq(s.weekRecipes.id, id));
    if (!r) return null;
    const snack = isSnackCode(r.code);
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
    };
  }
  if (kind === "sous_recette") {
    const [sr] = await db.select().from(s.weekSubRecipes).where(eq(s.weekSubRecipes.id, id));
    if (!sr) return null;
    return { category: "sous_recette", name: sr.name, code: null, unitWeightKg: null, refs: { ...none, weekSubRecipeId: sr.id }, importId: sr.importId, teamId: null, snack: false };
  }
  const [l] = await db.select().from(s.weekRecipeLines).where(eq(s.weekRecipeLines.id, id));
  if (!l || l.isSubRecipe) return null;
  return {
    category: "matiere_premiere",
    name: displayLabel(l.label),
    code: null,
    unitWeightKg: gramsToKg(l.unitWeightG),
    refs: { ...none, weekLineId: l.id },
    importId: l.importId,
    teamId: null,
    snack: false,
  };
}
