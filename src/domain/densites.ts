/**
 * Densités de référence des liquides alimentaires (kg/L à 20 °C), données le 18/11/2026 (docs/PHASE6.md) :
 * huiles d'après le Codex Alimentarius (norme CXS 210) et la FAO, autres liquides d'après le tableau fourni.
 * Valeur retenue : le **milieu de la plage** (décision du 18/11/2026). Rattachement par le nom de la matière, aux
 * liquides du tableau et aussi aux plus proches (mélange d'huiles = moyenne, lait demi-écrémé = entre entier et
 * écrémé, toute sauce soja = sauce soja, tout vinaigre = vinaigre blanc) ; sinon aucune densité (jamais devinée).
 */

const mid = (min: number, max: number) => Math.round(((min + max) / 2) * 10_000) / 10_000;

export const REFERENCE_DENSITIES = {
  "huile de sésame": mid(0.915, 0.925),
  "huile d'olive": mid(0.91, 0.916),
  "huile de colza": mid(0.91, 0.92),
  "huile de tournesol": mid(0.918, 0.923),
  "huile de soja": mid(0.919, 0.925),
  "huile de maïs": mid(0.917, 0.925),
  "huile d'arachide": mid(0.91, 0.92),
  "huile de noix": mid(0.92, 0.93),
  "huile de pépins de raisin": mid(0.92, 0.926),
  "huile de coco liquide": mid(0.908, 0.92),
  "huile de palme": mid(0.89, 0.9),
  "huile de lin": mid(0.925, 0.935),
  "huile d'avocat": mid(0.91, 0.92),
  "huile de noisette": mid(0.91, 0.92),
  eau: 0.998,
  "lait entier": mid(1.028, 1.034),
  "lait écrémé": mid(1.033, 1.037),
  "crème liquide": mid(0.99, 1.01),
  "jus d'orange": mid(1.04, 1.06),
  "jus de pomme": mid(1.04, 1.05),
  "vinaigre blanc": mid(1.005, 1.015),
  "vinaigre balsamique": mid(1.05, 1.1),
  "sauce soja": mid(1.1, 1.2),
  "sirop de glucose": mid(1.35, 1.45),
  "miel liquide": mid(1.38, 1.45),
  "sirop de sucre": mid(1.25, 1.35),
  mélasse: mid(1.35, 1.45),
} as const;

export type ReferenceLiquid = keyof typeof REFERENCE_DENSITIES;

export interface ReferenceDensity {
  densityKgPerL: number;
  /** Liquides du tableau utilisés (deux pour une moyenne). */
  liquids: ReferenceLiquid[];
  /** Rattachement au plus proche (pas une ligne exacte du tableau). */
  approximate: boolean;
}

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const OILS: [RegExp, ReferenceLiquid][] = [
  [/\bsesame\b/, "huile de sésame"],
  [/\bolive\b/, "huile d'olive"],
  [/\bcolza\b/, "huile de colza"],
  [/\btournesol\b/, "huile de tournesol"],
  [/\bsoja\b/, "huile de soja"],
  [/\bmais\b/, "huile de maïs"],
  [/\barachide\b/, "huile d'arachide"],
  [/\bnoix\b(?! de coco)/, "huile de noix"],
  [/\bpepins? de raisins?\b/, "huile de pépins de raisin"],
  [/\bcoco\b/, "huile de coco liquide"],
  [/\bpalme\b/, "huile de palme"],
  [/\blin\b/, "huile de lin"],
  [/\bavocat\b/, "huile d'avocat"],
  [/\bnoisette\b/, "huile de noisette"],
];

const of = (liquids: ReferenceLiquid[], approximate: boolean): ReferenceDensity => ({
  densityKgPerL: Math.round((liquids.reduce((n, l) => n + REFERENCE_DENSITIES[l], 0) / liquids.length) * 10_000) / 10_000,
  liquids,
  approximate,
});

/** Densité de référence d'une matière d'après son nom (libellé Melba), ou null. */
export function referenceDensity(name: string): ReferenceDensity | null {
  const f = fold(name);
  if (/^huiles? /.test(f)) {
    const oils = OILS.filter(([re]) => re.test(f)).map(([, l]) => l);
    return oils.length ? of(oils, oils.length > 1) : null;
  }
  if (/^lait /.test(f)) {
    if (/\bcoco\b/.test(f)) return null;
    if (/\bdemi ecreme\b/.test(f)) return of(["lait entier", "lait écrémé"], true);
    if (/\becreme\b/.test(f)) return of(["lait écrémé"], false);
    if (/\bentier\b/.test(f)) return of(["lait entier"], false);
    return null;
  }
  if (/^creme /.test(f)) {
    if (/\bliquide\b/.test(f)) return of(["crème liquide"], false);
    if (/\bfleurette\b/.test(f)) return of(["crème liquide"], true);
    return null;
  }
  if (/^(pur )?jus /.test(f)) {
    if (/\borange\b/.test(f)) return of(["jus d'orange"], false);
    if (/\bpommes?\b/.test(f)) return of(["jus de pomme"], false);
    return null;
  }
  if (/^vinaigre\b/.test(f)) {
    if (/\bbalsamique\b/.test(f)) return of(["vinaigre balsamique"], false);
    return of(["vinaigre blanc"], !/\bblanc\b/.test(f));
  }
  if (/^sauce soja\b/.test(f)) return of(["sauce soja"], /\bsucree\b/.test(f));
  if (/^(sirop de )?glucose\b/.test(f)) return of(["sirop de glucose"], false);
  if (/^sirop de sucre\b/.test(f)) return of(["sirop de sucre"], false);
  if (/^melasse\b/.test(f)) return of(["mélasse"], false);
  if (/^miel\b/.test(f)) return of(["miel liquide"], !/\bliquide\b/.test(f));
  if (/^eau\b/.test(f)) return of(["eau"], f !== "eau" && !/^eau au poids$/.test(f));
  return null;
}

/** Libellé lisible d'une densité de référence (« huile d'olive + huile de colza, moyenne »). */
export const referenceDensityLabel = (r: ReferenceDensity) =>
  `${r.liquids.join(" + ")}${r.liquids.length > 1 ? ", moyenne" : ""}${r.approximate && r.liquids.length === 1 ? ", au plus proche" : ""}`;
