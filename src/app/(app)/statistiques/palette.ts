/**
 * Couleurs des graphiques (décision du 23/11/2026, docs/REGLES_METIER.md R30) : tons chauds bruns, caramel, sable,
 * orange et bordeaux, choisis par l'administration, ajustés et rangés avec l'outil de vérification des couleurs.
 *
 * - Anneaux : `CHART_ORDER`, dans cet ordre ; deux parts voisines restent distinctes, y compris pour les daltonismes,
 *   et la première se distingue de toutes les autres (la dernière part touche la première).
 * - Colonnes à 2-4 séries : bordeaux, orange, caramel, puis brun nuit, contrôlés ensemble (le sable est trop proche
 *   de l'orange pour être côte à côte).
 * - Le brun foncé et le bordeaux sont plus sombres, le sable plus doux que la norme de l'outil : ils restent bien
 *   visibles sur fond blanc, et chaque graphique écrit sa légende.
 */
export const CHART = {
  caramel: "#9a6526",
  sable: "#c69b63",
  bordeaux: "#7d1a3c",
  orange: "#ef8219",
  brun: "#5b2c08",
  ocre: "#d9a441",
  brunNuit: "#2b1206",
  /** « Autres », « non couvert ». */
  gris: "#d6cfc8",
} as const;

/** Ordre des parts d'un anneau. */
export const CHART_ORDER = [CHART.caramel, CHART.sable, CHART.bordeaux, CHART.orange, CHART.brun, CHART.ocre];
