/**
 * Façons de mesurer une perte selon la zone et le produit (décision du 18/11/2026, règle R25) :
 * - partout : kg (et g) et unités du produit (pièces, converties avec le poids d'une pièce) ;
 * - gastros et contenants : seulement en Cuisine (dont le Déboîtage) et en Conditionnement ;
 * - barquettes : seulement en Conditionnement ;
 * - colis fournisseur (« sachet de 3 kg ») : seulement en Réception et en Stockage ;
 * - en Réception et en Stockage, les pièces ne sont proposées que si le poids d'une pièce est connu (jamais une
 *   perte à 0 kg) ; un consommable se compte toujours en pièces ;
 * - en Cuisine/production, aux quatre postes (décision du 23/11/2026, qui remplace celle du 20/11/2026) :
 *   1. Nombre de pièces, 2. Pesée à la balance (gastros tarés ou poids net saisi), 3. Estimation ; un consommable,
 *   un moule ou un plat à gratin s'y compte toujours en pièces ;
 * - en salle des cartons (Conditionnement, décision du 24/11/2026) : comme en Réception, 1. Nombre de barquettes ou
 *   d'encas, 2. Pesée à la balance, 3. Estimation, en kg seulement, sans gastros ; l'unité comptée est la barquette
 *   (poids de la barquette du plat) pour un plat, l'encas (poids d'un encas) pour un encas, proposée seulement si ce
 *   poids est connu (jamais une perte à 0 kg).
 */
import type { InputMethod } from "@/modules/declarations/input";

export const GASTRO_ZONE_CODES: readonly string[] = ["CUISINE"];
export const TRAY_ZONE_CODES: readonly string[] = ["CONDITIONNEMENT"];
export const PACKAGING_ZONE_CODES: readonly string[] = ["RECEPTION", "STOCKAGE"];

export interface MeasureContext {
  zoneCode: string;
  /** Poste (sous-zone). */
  subzoneCode?: string | null;
  /** Consommable, emballage, moule : compté, jamais converti en kg alimentaires. */
  isConsumable: boolean;
  /** Poids d'une pièce connu pour ce produit. */
  pieceWeightKnown: boolean;
  /** Encas (produit externe) : compté en encas en salle des cartons. */
  isSnack?: boolean;
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

/** Cuisine/production : pièces comptées une à une seulement (poisson, hauts de cuisse…), jamais des contenants. */
const KITCHEN_ZONE_CODE = "CUISINE";

/** Zones où l'on n'utilise que le kg (ni g ni mL) : Réception et Stockage (19/11/2026), salle des cartons (24/11/2026). */
const KG_ONLY_ZONE_CODES: readonly string[] = ["RECEPTION", "STOCKAGE", "CONDITIONNEMENT"];

/** Salle des cartons (barquettes jetées, encas jetés). */
const CARTONS_ZONE_CODE = "CONDITIONNEMENT";

/** Unité comptée en salle des cartons : l'encas (pièce) pour un encas, la barquette pour un plat. */
function cartonsUnitAllowed(code: string, c: MeasureContext): boolean {
  switch (code) {
    case "barquette":
      return !c.isSnack && !c.isConsumable && c.pieceWeightKnown;
    case "piece":
      return c.isConsumable || (!!c.isSnack && c.pieceWeightKnown);
    case "kg":
      return true;
    default:
      return false;
  }
}

function unitAllowed(code: string, c: MeasureContext): boolean {
  if (c.zoneCode === CARTONS_ZONE_CODE) return cartonsUnitAllowed(code, c);
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
  if (c.zoneCode === KITCHEN_ZONE_CODE) {
    if (c.isConsumable && method !== "comptage") return [];
    if (method === "comptage") return ["piece"];
  }
  return BASE_UNITS[method].filter((u) => unitAllowed(u, c));
}

/** Pesée dans des gastros (tare) : seulement là où les gastros existent. */
export const gastroTareAllowed = (c: MeasureContext) => GASTRO_ZONE_CODES.includes(c.zoneCode) && !c.isConsumable;

/**
 * Ordre et libellés des façons de mesurer, numérotées : matières reçues et stockées (décisions du 19/11/2026),
 * Cuisine/production (décision du 23/11/2026).
 */
const ORDERED_METHODS: readonly InputMethod[] = ["comptage", "pesee", "estimation_manuelle"];
const ZONE_METHOD_LABELS: Record<string, Partial<Record<InputMethod, string>>> = {
  RECEPTION: {
    comptage: "Comptage en nombre de colis, sachets ou unités",
    pesee: "Pesée à la balance",
    estimation_manuelle: "Estimation",
  },
  STOCKAGE: {
    comptage: "Comptage en nombre de colis, sachets ou unités",
    pesee: "Pesée à la balance",
    estimation_manuelle: "Estimation",
  },
  CUISINE: { comptage: "Nombre de pièces", pesee: "Pesée à la balance", estimation_manuelle: "Estimation" },
  CONDITIONNEMENT: {
    comptage: "Nombre d'unités",
    pesee: "Pesée à la balance",
    estimation_manuelle: "Estimation",
  },
};

/** Façons de mesurer proposées, dans l'ordre du lieu : celles qui ont au moins une unité. */
export function methodsFor(methods: readonly InputMethod[], c: MeasureContext): InputMethod[] {
  const ordered = ZONE_METHOD_LABELS[c.zoneCode] ? ORDERED_METHODS.filter((m) => methods.includes(m)) : methods;
  return ordered.filter((m) => unitsFor(m, c).length > 0);
}

/** Libellé d'une façon de mesurer dans ce lieu (numéroté là où l'ordre est fixé), sinon le libellé général. */
export function methodLabel(
  method: InputMethod,
  zoneCode: string,
  fallback: string,
  index: number,
  product?: Pick<MeasureContext, "isSnack" | "isConsumable">,
): string {
  const cartonsCount =
    method === "comptage" && zoneCode === CARTONS_ZONE_CODE && product && !product.isConsumable
      ? product.isSnack
        ? "Nombre d'encas"
        : "Nombre de barquettes"
      : null;
  const label = cartonsCount ?? ZONE_METHOD_LABELS[zoneCode]?.[method];
  return label ? `${index + 1}. ${label}` : fallback;
}

/** Nom de l'unité comptée là où elle a un sens précis : l'encas en salle des cartons (au lieu de « pièce »). */
export function countUnitLabel(code: string, c: Pick<MeasureContext, "zoneCode" | "isSnack" | "isConsumable">) {
  return code === "piece" && c.zoneCode === CARTONS_ZONE_CODE && c.isSnack && !c.isConsumable ? "encas" : null;
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

/** « (KG) », « kg » ou « g » : produit vendu au poids (vrac), pas un colis. */
export const isLooseByKg = (p: PackagingContent) => /^\(?\s*k?g\s*\)?$/.test(fold(p.packagingLabel ?? ""));

/** Mesures écrites (« 2,5kg », « 120 gr », « 3l », « 975ml ») : [quantité, unité] ; un poids en fourchette (« 140/160g ») est ignoré. */
const MEASURE = /(?<![\d/.,])(\d+(?:[.,]\d+)?)\s*(kg|grs|gr|g|cl|ml|l)(?![a-z])/gi;
function measures(text: string | null | undefined): { quantity: number; unit: string }[] {
  return [...(text ?? "").matchAll(MEASURE)].map((m) => ({
    quantity: Number(m[1]!.replace(",", ".")),
    unit: m[2]!.toLowerCase().replace(/^grs?$/, "g"),
  }));
}

/** Kg d'une quantité exprimée en masse, ou en volume avec la densité ; null sinon. */
function toKg(quantity: number, unit: string, densityKgPerL: number | null): number | null {
  const u = fold(unit);
  if (u in MASS) return quantity * MASS[u]!;
  if (u in VOLUME) return densityKgPerL == null ? null : quantity * VOLUME[u]! * densityKgPerL;
  return null;
}

/** Poids d'une pièce écrit dans le nom du produit (« Escalope de dinde 120g », « saucisse 60G ») : le dernier, en masse. */
export function pieceKgFromName(name: string | null | undefined): number | null {
  const mass = measures(name).filter((m) => m.unit === "kg" || m.unit === "g");
  const last = mass.at(-1);
  return last && last.quantity > 0 ? last.quantity * MASS[last.unit]! : null;
}

/**
 * Poids d'un colis en kg, d'après ce qui est écrit (décisions du 18 et du 19/11/2026), dans cet ordre :
 * 1. contenu en masse, ou en volume avec la densité (« 5 kg », « 64 cL ») ;
 * 2. contenu en sous-colis pesés (« 4 Sac 2,5kg », « 12 pièces de 125 gr », « 4 poche 3l ») ; si l'intitulé du colis
 *    donne un autre poids (« Carton de 5kg » pour 4 sacs de 2,5 kg), rien n'est retenu ;
 * 3. contenu en pièces, avec le poids d'une pièce du produit, sinon celui écrit dans son nom ;
 * 4. sans contenu, colis imbriqué dans l'intitulé (« Palette (80.00 Carton (10KG)) »).
 * Null si rien n'est écrit (« Carton / 10 Sachet ») : jamais deviné (règle R2), à compléter sur la fiche produit.
 */
export function packagingKg(
  p: PackagingContent,
  product: { unitWeightKg: number | null; densityKgPerL: number | null; name?: string | null },
): number | null {
  if (isLooseByKg(p)) return null;
  const round = (n: number | null) => (n == null ? null : Math.round(n * 10_000) / 10_000);
  const q = p.contentQuantity;
  if (q != null && q > 0 && p.contentUnit) {
    const direct = toKg(q, p.contentUnit, product.densityKgPerL);
    if (direct != null || fold(p.contentUnit) in VOLUME) return round(direct);
    const inner = measures(p.contentUnit);
    if (inner.length === 1) {
      const kg = toKg(q * inner[0]!.quantity, inner[0]!.unit, product.densityKgPerL);
      const label = measures(p.packagingLabel);
      const stated = label.length === 1 ? toKg(label[0]!.quantity, label[0]!.unit, product.densityKgPerL) : null;
      if (kg != null && stated != null && Math.abs(kg - stated) > stated * 0.01) return null;
      return round(kg);
    }
    if (inner.length > 1) return null;
    const piece = product.unitWeightKg ?? pieceKgFromName(product.name);
    return piece == null ? null : round(q * piece);
  }
  const nested = /(\d+(?:[.,]\d+)?)\s+[^()]*\(\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\s*\)/i.exec(p.packagingLabel ?? "");
  if (nested) {
    const count = Number(nested[1]!.replace(",", "."));
    return round(toKg(count * Number(nested[2]!.replace(",", ".")), nested[3]!, product.densityKgPerL));
  }
  return null;
}

/** Libellé d'un colis pour la saisie : « Sachet 5kg — Pro à Pro (5 kg) ». */
export const packagingChoiceLabel = (p: PackagingContent & { supplier: string }, kg: number) =>
  `${p.packagingLabel ?? "Colis"} — ${p.supplier} (${kg.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg)`;
