// Mises en forme partagées par les écrans d'historique.

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export const fmtNumber = (n: number) => numberFormat.format(n);
export const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));
export const fmtDateTime = (d: Date) => dateTimeFormat.format(d);

export const UNIT_LABELS: Record<string, string> = {
  kg: "kg",
  g: "g",
  l: "L",
  ml: "mL",
  piece: "pièce(s)",
  barquette: "barquette(s)",
  contenant: "contenant(s)",
  gastro: "gastro(s)",
};

export const STATUS_LABELS = {
  brouillon: "Brouillon",
  validee: "Validée",
  corrigee: "Corrigée",
  annulee: "Annulée",
} as const;

export const STATUS_STYLES = {
  brouillon: "bg-slate-100 text-slate-700",
  validee: "bg-emerald-50 text-emerald-800",
  corrigee: "bg-amber-50 text-amber-800",
  annulee: "bg-red-50 text-red-800 line-through",
} as const;

export function fmtQuantity(quantity: number, unitCode: string, netKg: number | null): string {
  const base = `${fmtNumber(quantity)} ${UNIT_LABELS[unitCode] ?? unitCode}`;
  return netKg != null && unitCode !== "kg" ? `${base} (${fmtNumber(netKg)} kg)` : base;
}
