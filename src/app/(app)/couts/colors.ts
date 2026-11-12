import type { COST_COMPONENTS } from "@/modules/couts/summary";

/** Couleurs fixes par composante du coût (palette catégorielle validée, ordre fixe : jamais réattribuées). */
export const COMPONENT_COLORS: Record<(typeof COST_COMPONENTS)[number]["key"], string> = {
  materialEur: "#2a78d6",
  labourEur: "#eb6834",
  packagingEur: "#1baf7a",
  indirectEur: "#eda100",
};
