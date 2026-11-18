/**
 * Recoupement d'une semaine de production (docs/PHASE6.md, étape 6.9), sans base de données : les ingrédients du
 * tome face aux lignes des bons de commande de la même semaine, rapprochés par la clé du libellé Melba.
 * Rien n'est déduit au-delà de ce que disent les deux documents : pas de quantité « nécessaire » calculée, pas de
 * seuil d'écart autre que l'arrondi du tome.
 */
import { PRICE_TOLERANCE, type TomeIngredientLine, tomeMaterials } from "./matieres";

export interface TomeUseLine extends TomeIngredientLine {
  /** Plat ou sous-recette où l'ingrédient apparaît (« VI02 Bœuf bourguignon », « Sous-recette : sauce tomate »). */
  usedIn: string;
}

export interface OrderedLine {
  key: string;
  designation: string;
  supplier: string;
  orderNumber: string;
  deliveryDate: string;
  quantity: number;
  packagingLabel: string | null;
  totalEur: number | null;
  perKgEur: number | null;
  perUnitEur: number | null;
}

export interface LastOrder {
  key: string;
  supplier: string;
  deliveryDate: string;
}

export interface WithoutOrder {
  key: string;
  name: string;
  usedIn: string[];
  /** Dernière commande avant cette semaine, s'il y en a une. */
  lastOrder: { supplier: string; deliveryDate: string } | null;
}

export interface NotInTome extends OrderedLine {
  /** Autres semaines dont le tome cite cette désignation (« S48-2026 »). */
  otherTomes: string[];
}

export interface PriceGap {
  key: string;
  name: string;
  supplier: string;
  deliveryDate: string;
  basis: "kg" | "unit";
  tomeEur: number;
  orderEur: number;
  /** (prix du bon − prix du tome) ÷ prix du tome. */
  gap: number;
}

export interface WeekReconciliation {
  tomeIngredients: number;
  orderLines: number;
  /** Ingrédients du tome présents dans au moins un bon de la semaine. */
  matched: number;
  withoutOrder: WithoutOrder[];
  notInTome: NotInTome[];
  priceGaps: PriceGap[];
  /** Ingrédients commandés dont le prix ne se compare pas (unités différentes, prix absent d'un côté). */
  incomparable: number;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "fr");

/** Écart de prix lisible : au-delà de l'arrondi du tome seulement. */
export const isPriceGap = (tomeEur: number, orderEur: number) =>
  tomeEur > 0 && Math.abs(orderEur - tomeEur) > PRICE_TOLERANCE * Math.max(tomeEur, orderEur);

export function reconcileWeek(input: {
  tomeLines: readonly TomeUseLine[];
  orderLines: readonly OrderedLine[];
  /** Dernière livraison de chaque clé avant la semaine (une par clé, la plus récente). */
  lastOrders: readonly LastOrder[];
  /** Clés citées par les tomes des autres semaines importées. */
  otherTomeKeys: ReadonlyMap<string, readonly string[]>;
}): WeekReconciliation {
  const materials = tomeMaterials(input.tomeLines);
  const usedIn = new Map<string, Set<string>>();
  for (const l of input.tomeLines) if (l.key) usedIn.set(l.key, (usedIn.get(l.key) ?? new Set()).add(l.usedIn));
  const ordered = new Map<string, OrderedLine[]>();
  for (const l of input.orderLines) ordered.set(l.key, [...(ordered.get(l.key) ?? []), l]);
  const lastOrder = new Map(input.lastOrders.map((o) => [o.key, o]));
  const tomeKeys = new Set(materials.map((m) => m.key));

  const withoutOrder: WithoutOrder[] = [];
  const priceGaps: PriceGap[] = [];
  let incomparable = 0;
  for (const m of materials) {
    const lines = ordered.get(m.key);
    if (!lines) {
      const last = lastOrder.get(m.key);
      withoutOrder.push({
        key: m.key,
        name: m.name,
        usedIn: [...(usedIn.get(m.key) ?? [])].sort((a, b) => a.localeCompare(b, "fr")),
        lastOrder: last ? { supplier: last.supplier, deliveryDate: last.deliveryDate } : null,
      });
      continue;
    }
    // Plusieurs livraisons de la même matière : la dernière fait foi, comme pour le prix en vigueur.
    const line = lines.reduce((a, b) => (b.deliveryDate > a.deliveryDate ? b : a));
    const basis =
      m.cost.perKgEur != null && line.perKgEur != null
        ? "kg"
        : m.cost.perUnitEur != null && line.perUnitEur != null
          ? "unit"
          : null;
    if (!basis) {
      incomparable++;
      continue;
    }
    const tomeEur = basis === "kg" ? m.cost.perKgEur! : m.cost.perUnitEur!;
    const orderEur = basis === "kg" ? line.perKgEur! : line.perUnitEur!;
    if (isPriceGap(tomeEur, orderEur)) {
      priceGaps.push({
        key: m.key,
        name: m.name,
        supplier: line.supplier,
        deliveryDate: line.deliveryDate,
        basis,
        tomeEur,
        orderEur,
        gap: (orderEur - tomeEur) / tomeEur,
      });
    }
  }

  const notInTome = input.orderLines
    .filter((l) => !tomeKeys.has(l.key))
    .map((l) => ({ ...l, otherTomes: [...(input.otherTomeKeys.get(l.key) ?? [])] }))
    .sort((a, b) => a.supplier.localeCompare(b.supplier, "fr") || a.designation.localeCompare(b.designation, "fr"));

  return {
    tomeIngredients: materials.length,
    orderLines: input.orderLines.length,
    matched: materials.filter((m) => ordered.has(m.key)).length,
    withoutOrder: withoutOrder.sort(byName),
    notInTome,
    priceGaps: priceGaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || byName(a, b)),
    incomparable,
  };
}
