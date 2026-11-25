/**
 * Coût matière d'une perte d'après le tome Melba de sa semaine (docs/PHASE2.md, étape 2.6).
 * Les coûts sont ceux de Melba, référence de l'entreprise. Ils sont figés sur la déclaration au moment de la
 * saisie : un nouveau tome ne change pas la valeur d'une perte passée.
 */
import { roundQuantity } from "./nombres";

export interface UnitCost {
  /** Coût d'un kg du produit (poids net, après cuisson pour une préparation). */
  perKgEur: number | null;
  /** Coût d'une unité comptée (portion / barquette, pièce) quand le produit se compte. */
  perUnitEur: number | null;
}

const NONE: UnitCost = { perKgEur: null, perUnitEur: null };
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Grammes d'une quantité exprimée en g ou kg ; null pour toute autre unité. */
export function gramsOf(quantity: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "g") return quantity;
  if (u === "kg") return quantity * 1000;
  return null;
}

/** Plat ou encas : coût d'une portion (« Recette totale ») et poids de la portion. */
export function dishUnitCost(costEur: number | null, portionWeightG: number | null): UnitCost {
  if (costEur == null) return NONE;
  return { perUnitEur: round4(costEur), perKgEur: portionWeightG ? round4((costEur / portionWeightG) * 1000) : null };
}

/** Sous-recette : coût total des ingrédients rapporté au poids net obtenu (« Poids net »). */
export function subRecipeUnitCost(costEur: number | null, net: { quantity: number; unit: string } | null): UnitCost {
  const grams = net ? gramsOf(net.quantity, net.unit) : null;
  if (costEur == null || !grams) return NONE;
  return { perKgEur: round4((costEur / grams) * 1000), perUnitEur: null };
}

/** Ingrédient : coût de la ligne rapporté à sa quantité (en grammes, ou par pièce si elle se compte). */
export function ingredientUnitCost(line: {
  costEur: number | null;
  quantity: number;
  unit: string;
  unitWeightG: number | null;
}): UnitCost {
  if (line.costEur == null || line.quantity <= 0) return NONE;
  const grams = gramsOf(line.quantity, line.unit) ?? (line.unitWeightG ? line.quantity * line.unitWeightG : null);
  const counted = gramsOf(1, line.unit) == null;
  return {
    perKgEur: grams ? round4((line.costEur / grams) * 1000) : null,
    perUnitEur: counted ? round4(line.costEur / line.quantity) : null,
  };
}

/** Unités comptées auxquelles s'applique un coût unitaire (une portion = une barquette, règle R10). */
const COUNT_UNITS = new Set(["piece", "barquette"]);

/**
 * Coût matière estimé d'une perte : nombre × coût unitaire pour une quantité comptée (barquettes, pièces : le
 * coût d'une portion est le plus exact), sinon poids net × coût au kg ; null si le coût ou la conversion manquent
 * (jamais deviné).
 */
export function estimateLossCost(
  loss: { netKg: number | null; quantity: number; unitCode: string },
  cost: UnitCost,
): number | null {
  if (cost.perUnitEur != null && COUNT_UNITS.has(loss.unitCode)) return roundQuantity(loss.quantity * cost.perUnitEur);
  if (loss.netKg != null && cost.perKgEur != null) return roundQuantity(loss.netKg * cost.perKgEur);
  return null;
}

/** Méthode de calcul enregistrée avec chaque perte (§18.5) ; à changer si la méthode évolue. */
export const COST_METHOD = "melba-semaine+emballages-v2";

// ─── Moule et barquette jetés avec le plat (décision du 25/11/2026, règle R42) ───
/** Postes où l'on demande si le moule et la barquette sont jetés : salle blanche, puis salle des cartons. */
const PACKAGING_SUBZONE_CODES: readonly string[] = ["CUI_SALLE_BLANCHE"];
const PACKAGING_ZONE_CODES: readonly string[] = ["CONDITIONNEMENT"];

export interface PackagingQuestions {
  /** Moules et plats à gratin du plat (tome) proposés : « jeté avec le plat ? » ; vide si le plat n'en a pas. */
  moulds: DishMould[];
  /** « Le plat était-il en barquette ? » : plat entier. */
  tray: boolean;
}
export interface DiscardedPackaging {
  /** Libellés des moules jetés avec le plat ([] : aucun) ; null ou absent : pas encore répondu. */
  moulds?: string[] | null;
  tray?: boolean | null;
}

/**
 * Questions posées pour un plat entier (jamais pour une sous-recette, un ingrédient ou un encas), seulement en salle
 * blanche et en salle des cartons ; avant, ni moule ni barquette ne sont comptés.
 */
export function packagingQuestionsFor(
  place: { zoneCode: string; subzoneCode: string | null },
  dish: { wholeDish: boolean; moulds: readonly DishMould[] | null },
): PackagingQuestions {
  const inScope =
    dish.wholeDish &&
    (PACKAGING_ZONE_CODES.includes(place.zoneCode) || PACKAGING_SUBZONE_CODES.includes(place.subzoneCode ?? ""));
  return { moulds: inScope ? [...(dish.moulds ?? [])] : [], tray: inScope };
}

export const asksPackaging = (q: PackagingQuestions) => q.moulds.length > 0 || q.tray;

/** Réponse manquante ou inattendue à une question posée, ou null. */
export function missingPackagingAnswer(q: PackagingQuestions, a: DiscardedPackaging | null | undefined) {
  if (q.moulds.length && a?.moulds == null) return "Indiquez si le moule ou le plat à gratin est jeté avec le plat";
  if (a?.moulds?.some((m) => !q.moulds.some((x) => x.label === m)))
    return "Moule inconnu pour ce plat : choisissez-le dans la liste";
  if (q.tray && a?.tray == null) return "Indiquez si la recette était en barquette";
  return null;
}

/**
 * Emballages d'une portion ajoutés au coût : le moule (ou plat à gratin) s'il est jeté avec, la barquette (emballages
 * par portion de l'administration) si elle est jetée ; null quand aucune question ne se pose.
 */
export function discardedPackagingPerPortion(
  q: PackagingQuestions,
  a: DiscardedPackaging | null | undefined,
  trayEur: number | null,
): number | null {
  if (!asksPackaging(q)) return null;
  const moulds = q.moulds.filter((m) => a?.moulds?.includes(m.label)).reduce((sum, m) => sum + m.eur, 0);
  const total = moulds + (q.tray && a?.tray ? (trayEur ?? 0) : 0);
  return Math.round(total * 100_000) / 100_000;
}

export interface CostInputs {
  /** Coût matières du produit (hors moules et plats à gratin). */
  food: UnitCost;
  /** Coût des emballages par portion (moules Melba + référentiel des emballages) ; null s'il ne s'applique pas. */
  packagingPerPortionEur: number | null;
  /** Poids d'une portion, pour compter les portions d'une perte pesée. */
  portionWeightKg: number | null;
  /** Produit qui est lui-même un emballage (moule, plat à gratin) : son coût va dans les emballages. */
  packagingItself?: UnitCost;
}

export interface CostBreakdown {
  /** Nombre de portions perdues (plats) : barquettes comptées, ou poids net ÷ poids d'une portion. */
  portions: number | null;
  foodEur: number | null;
  packagingEur: number | null;
  /** Main-d'œuvre : non imputée tant que la méthode n'est pas définie (§18.2). */
  labourEur: null;
  /** Charges indirectes : version ultérieure (§18.4). */
  indirectEur: null;
  /** Somme des composantes connues ; null si aucune n'est connue. */
  grossEur: number | null;
}

/** Coût brut d'une perte par composante (cahier des charges §18.6). */
export function lossCostBreakdown(
  loss: { netKg: number | null; quantity: number; unitCode: string },
  inputs: CostInputs,
): CostBreakdown {
  const portions = COUNT_UNITS.has(loss.unitCode)
    ? loss.quantity
    : loss.netKg != null && inputs.portionWeightKg
      ? roundQuantity(loss.netKg / inputs.portionWeightKg)
      : null;
  const foodEur = estimateLossCost(loss, inputs.food);
  const packagingEur = inputs.packagingItself
    ? estimateLossCost(loss, inputs.packagingItself)
    : portions != null && inputs.packagingPerPortionEur != null
      ? roundQuantity(portions * inputs.packagingPerPortionEur)
      : null;
  const known = [foodEur, packagingEur].filter((v): v is number => v != null);
  // Coût des matières inconnu (produit qui n'est pas lui-même un emballage) : le coût brut est inconnu, jamais
  // réduit aux seuls emballages (une perte à « 0 € » passerait pour valorisée).
  const foodMissing = foodEur == null && !inputs.packagingItself;
  return {
    portions,
    foodEur,
    packagingEur,
    labourEur: null,
    indirectEur: null,
    grossEur: !foodMissing && known.length ? roundQuantity(known.reduce((a, b) => a + b, 0)) : null,
  };
}

/**
 * Part des moules et plats à gratin dans le coût Melba d'une recette, sous-recettes comprises (au prorata de la
 * quantité de sous-recette utilisée). Sert à isoler les emballages déjà inclus dans le coût Melba (§18.1).
 */
export function mouldCostOf<L extends { label: string; costEur: number | null; subRecipeId: string | null }>(
  lines: readonly L[],
  subRecipes: ReadonlyMap<string, { totalCostEur: number | null; lines: readonly L[] }>,
  isMould: (label: string) => boolean,
): number {
  return Math.round(mouldLinesOf(lines, subRecipes, isMould).reduce((a, m) => a + m.eur, 0) * 10_000) / 10_000;
}

/** Moule ou plat à gratin d'un plat, tel que le tome le cite, et son coût par portion. */
export interface DishMould {
  label: string;
  eur: number;
  /** Nombre de moules par portion (1 pour un moule individuel, 0,125 pour un grand plat de 8 portions), si connu. */
  pieces?: number | null;
}

const mouldLabel = (label: string) => label.replace(/\s*\(\s*sous[\s-]*recettes?\s*\)\s*/i, " ").trim();

/**
 * Moules et plats à gratin d'un plat (lignes du tome, sous-recettes comprises au prorata de la quantité utilisée),
 * regroupés par libellé : proposés à la saisie quand le plat est jeté avec (R42). Quand le tome passe par une
 * sous-recette « Pot panna cotta » ou « Moule rond biodeg », on prend l'article qu'elle contient (« Pot KRAFT
 * 100ml », « MOULE ROND INDIVIDUEL BIODEG 180mL ») : c'est lui qui est jeté.
 */
export function mouldLinesOf<
  L extends { label: string; costEur: number | null; subRecipeId: string | null; quantity?: number | null },
>(
  lines: readonly L[],
  subRecipes: ReadonlyMap<string, { totalCostEur: number | null; lines: readonly L[] }>,
  isMould: (label: string) => boolean,
  depth = 0,
  share = 1,
  out = new Map<string, { eur: number; pieces: number | null }>(),
): DishMould[] {
  for (const line of lines) {
    if (line.costEur == null) continue;
    const sub = line.subRecipeId ? subRecipes.get(line.subRecipeId) : undefined;
    const subShare = sub?.totalCostEur ? (share * line.costEur) / sub.totalCostEur : null;
    if (isMould(line.label)) {
      // Sous-recette qui n'est qu'un moule : on descend jusqu'à l'article acheté.
      if (sub && subShare != null && depth < 5 && sub.lines.some((l) => l.costEur != null && isMould(l.label))) {
        mouldLinesOf(sub.lines, subRecipes, isMould, depth + 1, subShare, out);
        continue;
      }
      const label = mouldLabel(line.label);
      const known = out.get(label) ?? { eur: 0, pieces: 0 };
      const pieces = line.subRecipeId || line.quantity == null ? null : line.quantity * share;
      out.set(label, {
        eur: known.eur + line.costEur * share,
        pieces: known.pieces == null || pieces == null ? null : known.pieces + pieces,
      });
    } else if (sub && subShare != null && depth < 5) {
      mouldLinesOf(sub.lines, subRecipes, isMould, depth + 1, subShare, out);
    }
  }
  return depth > 0
    ? []
    : [...out]
        .map(([label, m]) => ({
          label,
          eur: Math.round(m.eur * 10_000) / 10_000,
          pieces: m.pieces == null ? null : Math.round(m.pieces * 1000) / 1000,
        }))
        .filter((m) => m.eur > 0)
        .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/** Clé de rapprochement d'un nom d'article : sans accents, ni ponctuation, ni majuscules. */
const nameTokens = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** Même article : mêmes mots dans le même ordre, un mot abrégé comptant pour le mot entier (« INDIV » = « INDIVIDUEL »). */
export function sameArticleName(a: string, b: string) {
  const x = nameTokens(a);
  const y = nameTokens(b);
  return (
    x.length > 0 &&
    x.length === y.length &&
    x.every((w, i) => {
      const v = y[i]!;
      return w === v || (Math.min(w.length, v.length) >= 3 && (w.startsWith(v) || v.startsWith(w)));
    })
  );
}

/** Emballage réglé par l'administration (Emballages et consommables), avec son coût unitaire en vigueur. */
export interface PackagingItemPrice {
  name: string;
  code: string;
  unitCostEur: number | null;
}

/**
 * Nom et prix des moules réglés par l'administration (26/11/2026) : un moule du tome qui correspond à un emballage
 * de l'administration prend son nom et son coût unitaire × le nombre de moules par portion. Sinon, le tome.
 */
export function priceMoulds(moulds: readonly DishMould[], items: readonly PackagingItemPrice[]): DishMould[] {
  const merged = new Map<string, DishMould>();
  for (const m of moulds) {
    const item = items.find((i) => sameArticleName(i.name, m.label) || sameArticleName(i.code, m.label));
    const priced =
      item && item.unitCostEur != null && m.pieces != null
        ? { label: item.name, eur: Math.round(m.pieces * item.unitCostEur * 10_000) / 10_000, pieces: m.pieces }
        : { ...m, label: item?.name ?? m.label };
    const known = merged.get(priced.label);
    merged.set(
      priced.label,
      known
        ? {
            label: priced.label,
            eur: Math.round((known.eur + priced.eur) * 10_000) / 10_000,
            pieces: known.pieces == null || priced.pieces == null ? null : known.pieces + priced.pieces,
          }
        : priced,
    );
  }
  return [...merged.values()].filter((m) => m.eur > 0).sort((a, b) => a.label.localeCompare(b.label, "fr"));
}
