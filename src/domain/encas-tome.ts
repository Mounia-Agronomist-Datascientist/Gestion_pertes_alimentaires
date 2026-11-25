/**
 * Encas lus dans un PDF Melba « Imprimer les recettes » (décision du 25/11/2026, règle R41), sans base de données.
 *
 * Une recette d'encas (code EN…, par exemple EN09_FB « Barre de céréales… ») donne :
 * - pour chaque article acheté qui la compose (« Barres de céréales … Biscuiterie de Sommières », Unité (30 g),
 *   0,90 €) : le poids d'un article et son prix, rangés sur l'encas de la liste interne (clé Melba de l'article) ;
 * - quand la recette n'est pas un seul article pris une fois (trio de fromages, 2 pots de yaourt) : un encas
 *   « composé » de plus, au poids et au coût de la recette.
 */
import { dishUnitCost, gramsOf, ingredientUnitCost, type UnitCost } from "./couts";

export interface SnackTomeLine {
  label: string;
  key: string;
  isSubRecipe: boolean;
  quantity: number;
  unit: string;
  unitWeightG: number | null;
  cost: number | null;
}

export interface SnackTomeRecipe {
  year: number;
  week: number;
  code: string;
  name: string;
  lines: SnackTomeLine[];
  total: { quantity: number; unit: string; cost: number | null } | null;
}

/** Ce qu'un PDF apprend d'un encas pour une semaine. */
export interface SnackFact {
  /** Clé de rapprochement (article : clé Melba ; encas composé : nom de la recette). */
  key: string;
  name: string;
  composite: boolean;
  year: number;
  week: number;
  /** Unité telle qu'imprimée (« Unité (30 g) ») ; null pour un encas composé. */
  unit: string | null;
  unitWeightG: number | null;
  cost: UnitCost;
  /** Codes des recettes qui le citent (EN09_FB…). */
  codes: string[];
  /** Encas composé : clés des articles qui le composent. */
  articleKeys: string[];
}

export const isSnackRecipeCode = (code: string) => /^EN\d/.test(code);

/** Encas composé : autre chose qu'un seul article pris une fois. */
export const isCompositeSnack = (r: Pick<SnackTomeRecipe, "lines">) =>
  !(r.lines.length === 1 && !r.lines[0]!.isSubRecipe && r.lines[0]!.quantity === 1);

/** Clé d'un encas composé, à partir du nom de sa recette (mêmes règles que les clés Melba). */
export const compositeSnackKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const weekKey = (f: { year: number; week: number }) => f.year * 100 + f.week;

/**
 * Encas d'une liste de recettes, une ligne par encas et par semaine, de la plus ancienne à la plus récente.
 * Les recettes qui ne sont pas des encas sont ignorées ; un même encas cité par plusieurs recettes de la même
 * semaine (EN10_FB et EN23_MN) n'apparaît qu'une fois.
 */
export function snackFacts(recipes: readonly SnackTomeRecipe[]): SnackFact[] {
  const facts = new Map<string, SnackFact>();
  const add = (f: SnackFact) => {
    const id = `${weekKey(f)}|${f.composite ? "c" : "a"}|${f.key}`;
    const known = facts.get(id);
    if (known) {
      known.codes = [...new Set([...known.codes, ...f.codes])];
      // Le coût le mieux renseigné l'emporte (une ligne sans coût n'efface pas un coût lu ailleurs).
      if (known.cost.perUnitEur == null && f.cost.perUnitEur != null) known.cost = f.cost;
      if (known.unitWeightG == null) known.unitWeightG = f.unitWeightG;
      return;
    }
    facts.set(id, f);
  };
  for (const r of recipes) {
    if (!isSnackRecipeCode(r.code)) continue;
    const articles = r.lines.filter((l) => !l.isSubRecipe && l.key);
    for (const l of articles) {
      const unitWeightG = l.unitWeightG ?? gramsOf(1, l.unit);
      add({
        key: l.key,
        name: l.label.trim(),
        composite: false,
        year: r.year,
        week: r.week,
        unit: l.unit.trim(),
        unitWeightG,
        cost: ingredientUnitCost({ costEur: l.cost, quantity: l.quantity, unit: l.unit, unitWeightG: l.unitWeightG }),
        codes: [r.code],
        articleKeys: [],
      });
    }
    if (isCompositeSnack(r)) {
      const weightG = r.total ? gramsOf(r.total.quantity, r.total.unit) : null;
      add({
        key: compositeSnackKey(r.name),
        name: r.name.trim(),
        composite: true,
        year: r.year,
        week: r.week,
        unit: null,
        unitWeightG: weightG,
        cost: dishUnitCost(r.total?.cost ?? null, weightG),
        codes: [r.code],
        articleKeys: articles.map((l) => l.key),
      });
    }
  }
  // Articles avant les encas composés de la même semaine : la famille d'un composé se lit sur ses articles.
  return [...facts.values()].sort(
    (a, b) => weekKey(a) - weekKey(b) || Number(a.composite) - Number(b.composite) || a.name.localeCompare(b.name),
  );
}
