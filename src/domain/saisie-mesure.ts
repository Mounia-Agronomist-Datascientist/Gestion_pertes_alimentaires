/**
 * Façons de mesurer une perte selon la zone et le produit (décision du 18/11/2026, règle R25) :
 * - partout : kg (et g) et unités du produit (pièces, converties avec le poids d'une pièce) ;
 * - gastros et contenants : seulement en Cuisine (dont le Déboîtage) et en Conditionnement ;
 * - barquettes : seulement en Conditionnement ;
 * - colis fournisseur (« sachet de 3 kg ») : seulement en Réception et en Stockage ;
 * - en Réception et en Stockage, les pièces ne sont proposées que si le poids d'une pièce est connu (jamais une
 *   perte à 0 kg) ; un consommable se compte toujours en pièces.
 */
import type { InputMethod } from "@/modules/declarations/input";

export const GASTRO_ZONE_CODES: readonly string[] = ["CUISINE", "CONDITIONNEMENT"];
export const TRAY_ZONE_CODES: readonly string[] = ["CONDITIONNEMENT"];
export const PACKAGING_ZONE_CODES: readonly string[] = ["RECEPTION", "STOCKAGE"];

export interface MeasureContext {
  zoneCode: string;
  /** Consommable, emballage, moule : compté, jamais converti en kg alimentaires. */
  isConsumable: boolean;
  /** Poids d'une pièce connu pour ce produit. */
  pieceWeightKnown: boolean;
  /** Au moins un colis fournisseur convertible en kg pour ce produit (sinon, poids du colis indiqué à la saisie). */
  hasPackaging: boolean;
}

/** Unités de chaque façon de mesurer, avant le filtre par zone et produit. */
const BASE_UNITS: Record<InputMethod, readonly string[]> = {
  pesee: ["kg", "g"],
  comptage: ["piece", "colis", "barquette", "contenant"],
  estimation_contenant: ["gastro", "contenant"],
  estimation_manuelle: ["kg", "g", "l", "ml", "piece", "colis", "barquette", "contenant", "gastro"],
};

/** Zones où l'on n'utilise que le kg (ni g ni mL) : Réception (décision du 19/11/2026). */
const KG_ONLY_ZONE_CODES: readonly string[] = ["RECEPTION"];

function unitAllowed(code: string, c: MeasureContext): boolean {
  switch (code) {
    case "g":
      return !KG_ONLY_ZONE_CODES.includes(c.zoneCode);
    case "gastro":
    case "contenant":
      return GASTRO_ZONE_CODES.includes(c.zoneCode) && !c.isConsumable;
    case "barquette":
      return TRAY_ZONE_CODES.includes(c.zoneCode);
    case "colis":
      // Colis connu (bons, fiche produit) ou poids du colis indiqué à la saisie (« Autre colis »).
      return PACKAGING_ZONE_CODES.includes(c.zoneCode) && !c.isConsumable;
    case "piece":
      return c.isConsumable || c.pieceWeightKnown || !PACKAGING_ZONE_CODES.includes(c.zoneCode);
    case "l":
      return !c.isConsumable;
    case "ml":
      return !c.isConsumable && !KG_ONLY_ZONE_CODES.includes(c.zoneCode);
    default:
      return true;
  }
}

/** Unités proposées pour une façon de mesurer, dans ce lieu et pour ce produit. */
export function unitsFor(method: InputMethod, c: MeasureContext): string[] {
  return BASE_UNITS[method].filter((u) => unitAllowed(u, c));
}

/** Pesée dans des gastros (tare) : seulement là où les gastros existent. */
export const gastroTareAllowed = (c: MeasureContext) => GASTRO_ZONE_CODES.includes(c.zoneCode) && !c.isConsumable;

/** Ordre et libellés des façons de mesurer en Réception (décision du 19/11/2026). */
const RECEPTION_METHODS: readonly InputMethod[] = ["comptage", "pesee", "estimation_manuelle"];
const RECEPTION_LABELS: Partial<Record<InputMethod, string>> = {
  comptage: "Comptage en nombre de colis, sachets ou unités",
  pesee: "Pesée à la balance",
  estimation_manuelle: "Estimation",
};

/** Façons de mesurer proposées, dans l'ordre du lieu : celles qui ont au moins une unité. */
export function methodsFor(methods: readonly InputMethod[], c: MeasureContext): InputMethod[] {
  const ordered = c.zoneCode === "RECEPTION" ? RECEPTION_METHODS.filter((m) => methods.includes(m)) : methods;
  return ordered.filter((m) => unitsFor(m, c).length > 0);
}

/** Libellé d'une façon de mesurer dans ce lieu (numéroté en Réception), sinon le libellé général. */
export function methodLabel(method: InputMethod, zoneCode: string, fallback: string, index: number): string {
  const label = zoneCode === "RECEPTION" ? RECEPTION_LABELS[method] : undefined;
  return label ? `${index + 1}. ${label}` : fallback;
}

// ─── Poids d'un colis fournisseur ───────────────────────────────────────────

export interface PackagingContent {
  packagingLabel: string | null;
  contentQuantity: number | null;
  contentUnit: string | null;
}

const MASS: Record<string, number> = { kg: 1, g: 0.001 };
const VOLUME: Record<string, number> = { l: 1, cl: 0.01, ml: 0.001 };
const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** « (KG) » : produit vendu au kg (vrac), pas un colis. */
export const isLooseByKg = (p: PackagingContent) => /^\(?\s*kg\s*\)?$/.test(fold(p.packagingLabel ?? ""));

/**
 * Poids d'un colis en kg, d'après son contenu : en masse directement, en volume avec la densité du produit, en
 * pièces (« 20 saucisses », « pièce(s) ») avec le poids d'une pièce. Null si le contenu n'est pas convertible
 * (jamais deviné, règle R2).
 */
export function packagingKg(
  p: PackagingContent,
  product: { unitWeightKg: number | null; densityKgPerL: number | null },
): number | null {
  if (isLooseByKg(p) || p.contentQuantity == null || p.contentQuantity <= 0 || !p.contentUnit) return null;
  const unit = fold(p.contentUnit);
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  if (unit in MASS) return round(p.contentQuantity * MASS[unit]!);
  if (unit in VOLUME)
    return product.densityKgPerL == null ? null : round(p.contentQuantity * VOLUME[unit]! * product.densityKgPerL);
  // Un contenu en volume écrit autrement (« poche 3l ») n'est pas interprété.
  if (/\d/.test(unit)) return null;
  return product.unitWeightKg == null ? null : round(p.contentQuantity * product.unitWeightKg);
}

/** Libellé d'un colis pour la saisie : « Sachet 5kg — Pro à Pro (5 kg) ». */
export const packagingChoiceLabel = (p: PackagingContent & { supplier: string }, kg: number) =>
  `${p.packagingLabel ?? "Colis"} — ${p.supplier} (${kg.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg)`;
