/**
 * Rapprochement du tome et du plan de production d'une même semaine (docs/PHASE2.md, étape 2.3).
 * Pur : ne lit ni n'écrit la base. Produit l'aperçu montré avant validation.
 */
import type { PlanParseResult } from "./plan/parse-plan";
import type { TomeParseResult, TomeRecipe, TomeSubRecipe } from "./tome/parse-tome";

/** Encas (règle R9) : codes « EN… », hors plan de production, proposés en conditionnement, réception et stockage. */
export const isSnackCode = (code: string) => /^EN\d/.test(code);

export interface WeekImportRecipe extends TomeRecipe {
  team: string | null;
  planGroup: string | null;
  planBlock: "plats" | "petits_dejeuners" | null;
  weekBarquettes: number | null;
  firstDayBarquettes: number | null;
}

export interface WeekImportPreview {
  year: number | null;
  week: number | null;
  recipes: WeekImportRecipe[];
  subRecipes: TomeSubRecipe[];
  /** Empêchent la validation. */
  errors: string[];
  /** Points à vérifier, n'empêchent pas la validation. */
  warnings: string[];
}

export function buildWeekImport(tome: TomeParseResult, plan: PlanParseResult): WeekImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [
    ...tome.anomalies.map((a) => `Tome, page ${a.page} : ${a.message}`),
    ...plan.anomalies.map((a) => `Plan : ${a}`),
  ];

  const weeks = [...new Set(tome.recipes.map((r) => `${r.year}-${r.week}`))];
  if (tome.recipes.length === 0) errors.push("Aucune recette lue dans le tome : est-ce bien le PDF « Imprimer les recettes » de Melba ?");
  if (weeks.length > 1) errors.push(`Le tome mélange plusieurs semaines (${weeks.join(", ")})`);
  const year = tome.recipes[0]?.year ?? null;
  const week = tome.recipes[0]?.week ?? null;
  if (week != null && plan.week != null && week !== plan.week) {
    errors.push(`Le tome est celui de la semaine ${week}, l'onglet du plan celui de la semaine ${plan.week}`);
  }
  if (plan.groups.length === 0) errors.push("Aucun plat lu dans l'onglet du plan de production");

  const groupOf = new Map(plan.groups.flatMap((g) => g.codes.map((code) => [code, g] as const)));
  const volumeOf = new Map(plan.volumes.map((v) => [v.code, v]));
  const recipes: WeekImportRecipe[] = tome.recipes.map((r) => {
    const group = groupOf.get(r.code);
    const volume = volumeOf.get(r.code);
    return {
      ...r,
      team: group?.team ?? null,
      planGroup: group?.codes.join("/") ?? null,
      planBlock: group?.block ?? null,
      weekBarquettes: volume?.weekBarquettes != null ? Math.round(volume.weekBarquettes) : null,
      firstDayBarquettes: volume?.firstDayBarquettes != null ? Math.round(volume.firstDayBarquettes) : null,
    };
  });

  const tomeCodes = new Set(tome.recipes.map((r) => r.code));
  const missingInTome = [...new Set([...groupOf.keys(), ...volumeOf.keys()])].filter((c) => !tomeCodes.has(c));
  if (missingInTome.length) warnings.push(`Codes du plan absents du tome (aucune recette) : ${missingInTome.join(", ")}`);
  const withoutTeam = recipes.filter((r) => !r.team && !isSnackCode(r.code)).map((r) => r.code);
  if (withoutTeam.length) {
    warnings.push(`Recettes du tome sans équipe dans le plan (non proposées aux équipes) : ${withoutTeam.join(", ")}`);
  }

  return { year, week, recipes, subRecipes: tome.subRecipes, errors, warnings };
}
