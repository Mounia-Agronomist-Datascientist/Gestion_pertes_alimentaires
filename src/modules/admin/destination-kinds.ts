/** Types de destination (énumération `destination_kind`), utilisables côté navigateur. */
export const DESTINATION_KINDS = ["destruction", "compost", "don", "personnel", "vente", "reutilisation", "retour_fournisseur", "autre"] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const DESTINATION_KIND_LABELS: Record<DestinationKind, string> = {
  destruction: "Destruction",
  compost: "Compost / méthanisation",
  don: "Don",
  personnel: "Personnel",
  vente: "Vente",
  reutilisation: "Réutilisation",
  retour_fournisseur: "Retour fournisseur",
  autre: "Autre",
};

/** N° de poubelle demandé à chaque perte (énumération `bin_number_mode`). */
export const BIN_NUMBER_MODES = ["aucun", "facultatif", "obligatoire"] as const;
export type BinNumberMode = (typeof BIN_NUMBER_MODES)[number];

export const BIN_NUMBER_MODE_LABELS: Record<BinNumberMode, string> = {
  aucun: "Non demandé",
  facultatif: "Demandé, facultatif",
  obligatoire: "Demandé, obligatoire",
};
