import { CHART } from "../statistiques/palette";
import type { COST_COMPONENTS } from "@/modules/couts/summary";

/** Couleurs fixes par composante du coût (palette catégorielle validée, ordre fixe : jamais réattribuées). */
export const COMPONENT_COLORS: Record<(typeof COST_COMPONENTS)[number]["key"], string> = {
  materialEur: CHART.bordeaux,
  labourEur: CHART.orange,
  packagingEur: CHART.caramel,
  indirectEur: CHART.brunNuit,
};
