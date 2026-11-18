/**
 * Ventes et dons des surplus de barquettes, d'après les fichiers de l'entreprise (docs/PHASE5.md, étape 5.8).
 *
 * Les montants ne s'additionnent jamais entre eux : ils n'ont pas la même base (précisions du 16/11/2026).
 * - Too Good To Go : prix payé par les clients pour chaque vente, et versements reçus HT après commission (un
 *   versement couvre les ventes des semaines précédentes, il est compté à sa date) ;
 * - ventes flash : chiffre d'affaires TTC ;
 * - Linkee : aucune recette ; coût matières Melba des barquettes données, quand le plat est retrouvé.
 */
import { roundQuantity } from "./nombres";

export const SURPLUS_SOURCES = ["tgtg", "vente_flash", "linkee"] as const;
export type SurplusSource = (typeof SURPLUS_SOURCES)[number];

export interface SurplusFact {
  source: SurplusSource;
  kind: "vente" | "versement" | "don";
  occurredOn: string;
  trays: number;
  breakfastTrays: number;
  offeredTrays: number | null;
  boxes: number | null;
  breakfastBoxes: number | null;
  amountEur: number | null;
  netKg: number | null;
  costEur: number | null;
  collected: boolean | null;
}

export interface SurplusTotals {
  tgtg: {
    sales: number;
    /** Barquettes proposées (ventes où le nombre est noté). */
    offeredTrays: number;
    trays: number;
    /** Prix payé par les clients ; null sans droit aux euros. */
    clientEur: number | null;
    /** Ventes sans montant. */
    missingAmount: number;
    payouts: number;
    /** Versements reçus, HT après commission ; null sans droit aux euros. */
    receivedEur: number | null;
  };
  flash: {
    sales: number;
    boxes: number;
    breakfastBoxes: number;
    trays: number;
    breakfastTrays: number;
    /** Chiffre d'affaires TTC ; null sans droit aux euros. */
    revenueEur: number | null;
    missingAmount: number;
  };
  linkee: {
    /** Dates de collecte distinctes. */
    collections: number;
    dishes: number;
    trays: number;
    /** Barquettes dont « Collecté ? » n'est pas coché. */
    notCollectedTrays: number;
    /** Kg des plats retrouvés dans Melba, et barquettes concernées. */
    kg: number;
    weighedTrays: number;
    /** Coût matières Melba ; null sans droit aux euros. */
    costEur: number | null;
    costedTrays: number;
  };
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function summarizeSurplus(facts: readonly SurplusFact[], withCosts: boolean): SurplusTotals {
  const t = {
    tgtg: { sales: 0, offeredTrays: 0, trays: 0, clientEur: 0, missingAmount: 0, payouts: 0, receivedEur: 0 },
    flash: { sales: 0, boxes: 0, breakfastBoxes: 0, trays: 0, breakfastTrays: 0, revenueEur: 0, missingAmount: 0 },
    linkee: {
      collections: 0,
      dishes: 0,
      trays: 0,
      notCollectedTrays: 0,
      kg: 0,
      weighedTrays: 0,
      costEur: 0,
      costedTrays: 0,
    },
  };
  const collectionDates = new Set<string>();
  for (const f of facts) {
    if (f.source === "tgtg" && f.kind === "versement") {
      t.tgtg.payouts++;
      t.tgtg.receivedEur += f.amountEur ?? 0;
    } else if (f.source === "tgtg") {
      t.tgtg.sales++;
      t.tgtg.trays += f.trays;
      t.tgtg.offeredTrays += f.offeredTrays ?? 0;
      if (f.amountEur == null) t.tgtg.missingAmount++;
      else t.tgtg.clientEur += f.amountEur;
    } else if (f.source === "vente_flash") {
      t.flash.sales++;
      t.flash.boxes += f.boxes ?? 0;
      t.flash.breakfastBoxes += f.breakfastBoxes ?? 0;
      t.flash.trays += f.trays;
      t.flash.breakfastTrays += f.breakfastTrays;
      if (f.amountEur == null) t.flash.missingAmount++;
      else t.flash.revenueEur += f.amountEur;
    } else {
      collectionDates.add(f.occurredOn);
      t.linkee.dishes++;
      t.linkee.trays += f.trays;
      if (!f.collected) t.linkee.notCollectedTrays += f.trays;
      if (f.netKg != null) {
        t.linkee.kg += f.netKg;
        t.linkee.weighedTrays += f.trays;
      }
      if (f.costEur != null) {
        t.linkee.costEur += f.costEur;
        t.linkee.costedTrays += f.trays;
      }
    }
  }
  t.linkee.collections = collectionDates.size;
  return {
    tgtg: {
      ...t.tgtg,
      clientEur: withCosts ? cents(t.tgtg.clientEur) : null,
      receivedEur: withCosts ? cents(t.tgtg.receivedEur) : null,
    },
    flash: { ...t.flash, revenueEur: withCosts ? cents(t.flash.revenueEur) : null },
    linkee: { ...t.linkee, kg: roundQuantity(t.linkee.kg), costEur: withCosts ? cents(t.linkee.costEur) : null },
  };
}

/** Barquettes vendues ou données par source (plats et petits-déjeuners). */
export function surplusTrays(t: SurplusTotals): Record<SurplusSource, number> {
  return { tgtg: t.tgtg.trays, vente_flash: t.flash.trays + t.flash.breakfastTrays, linkee: t.linkee.trays };
}
