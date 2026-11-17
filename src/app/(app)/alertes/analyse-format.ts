import { formatProductionWeek } from "@/domain/semaine-production";
import type { LossAlertView } from "@/modules/alertes/consultation";

const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

const SCOPE_LABELS: Record<LossAlertView["scope"], string> = { equipe: "Équipe", zone: "Zone", plat: "Plat" };

/** « Perte inhabituelle · Plat VI01_… · S45-2026 » */
export function lossAlertTitle(a: LossAlertView): string {
  const kind = a.kind === "perte_inhabituelle" ? "Perte inhabituelle" : "Cause récurrente";
  const subject = a.scope === "equipe" ? a.label : `${SCOPE_LABELS[a.scope]} ${a.label}`;
  return `${kind} · ${subject} · ${formatProductionWeek(a.week)}`;
}

type Weight = { label: string; kg: number };
type RecurringWeek = { week: string; kg: number; events: number; share: number | null };

/** Phrase principale de l'alerte. */
export function lossAlertSummary(a: LossAlertView): string {
  if (a.kind === "cause_recurrente") {
    const d = a.details as { causeName?: string; weeks?: RecurringWeek[] };
    const weeks = d.weeks ?? [];
    return `« ${d.causeName ?? "?"} » est la première cause de pertes ${weeks.length} semaines de suite (${weeks.map((w) => w.week).join(", ")}) : ${weeks
      .map((w) => `${num.format(w.kg)} kg${w.share != null ? ` (${pct.format(w.share)})` : ""}`)
      .join(", ")}.`;
  }
  const unit = a.measure === "kg_1000" ? " kg pour 1 000 barquettes produites" : " kg";
  const weeks = `${a.referenceWeeks} semaine${(a.referenceWeeks ?? 0) > 1 ? "s" : ""}`;
  if (!a.reference) return `${num.format(a.value ?? 0)}${unit} cette semaine, aucune perte les ${weeks} d'avant.`;
  return `${num.format(a.value ?? 0)}${unit} cette semaine contre ${num.format(a.reference)}${unit === " kg" ? " kg" : ""} en moyenne sur les ${weeks} d'avant (+${pct.format(a.rate ?? 0)}).`;
}

/** Contexte : causes et produits qui pèsent le plus (perte inhabituelle). */
export function lossAlertContext(a: LossAlertView): string | null {
  if (a.kind !== "perte_inhabituelle") return null;
  const d = a.details as { causes?: Weight[]; products?: Weight[] };
  const list = (rows: Weight[] | undefined) => (rows ?? []).map((r) => `${r.label} (${num.format(r.kg)} kg)`).join(", ");
  const parts = [d.causes?.length ? `Causes : ${list(d.causes)}` : null, d.products?.length && a.scope !== "plat" ? `Produits : ${list(d.products)}` : null].filter(Boolean);
  return parts.length ? `${parts.join(" · ")}.` : null;
}
