/**
 * Couleurs des graphiques, assorties à la charte (décision du 23/11/2026, docs/REGLES_METIER.md R30) : une seule
 * palette pour les anneaux et les colonnes, contrôlée avec l'outil de vérification des couleurs (luminosité,
 * saturation, daltonismes). Toujours dans cet ordre ; un graphique à 2-4 séries prend des couleurs voisines de la
 * liste, vérifiées ensemble.
 */
export const CHART = {
  rouge: "#d90019",
  bleu: "#1f6fa3",
  moutarde: "#e0a31b",
  sarcelle: "#2a9d8f",
  caramel: "#c9773a",
  prune: "#7b4fa0",
  /** « Autres », « non couvert ». */
  gris: "#b3aaa3",
} as const;

/** Ordre des parts d'un anneau. */
export const CHART_ORDER = [CHART.rouge, CHART.bleu, CHART.moutarde, CHART.sarcelle, CHART.caramel, CHART.prune];
