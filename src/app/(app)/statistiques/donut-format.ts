/** Mise en forme des valeurs des anneaux, utilisée côté serveur (total) et dans le navigateur (« Autres »). */
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Unité des valeurs d'un anneau. */
export type DonutUnit = "kg" | "euro" | "kgco2" | "pertes";
export const formatDonutValue = (unit: DonutUnit, v: number) =>
  unit === "euro"
    ? euro.format(v)
    : unit === "kgco2"
      ? v >= 1000
        ? `${num.format(v / 1000)} t CO2e`
        : `${num.format(v)} kg CO2e`
      : unit === "pertes"
        ? `${Math.round(v)} perte${Math.round(v) > 1 ? "s" : ""}`
        : `${num.format(v)} kg`;
