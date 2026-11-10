/** Types d'emballage et de portion (énumérations de la base), utilisables côté navigateur. */
export const PACKAGING_KINDS = ["barquette", "film", "etiquette", "moule", "plat", "gastro", "autre"] as const;
export type PackagingKind = (typeof PACKAGING_KINDS)[number];

export const PACKAGING_KIND_LABELS: Record<PackagingKind, string> = {
  barquette: "Barquette",
  film: "Film",
  etiquette: "Étiquette",
  moule: "Moule à gratin",
  plat: "Plat",
  gastro: "Gastro",
  autre: "Autre consommable",
};

export const PORTION_KINDS = ["plat", "petit_dejeuner"] as const;
export type PortionKind = (typeof PORTION_KINDS)[number];

export const PORTION_KIND_LABELS: Record<PortionKind, string> = {
  plat: "Par plat",
  petit_dejeuner: "Par petit-déjeuner",
};
