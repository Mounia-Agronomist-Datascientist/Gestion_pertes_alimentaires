"use client";

import { productLabel } from "@/domain/produits";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  type CostInputs,
  type DiscardedPackaging,
  type DishMould,
  asksPackaging,
  discardedPackagingPerPortion,
  lossCostBreakdown,
  missingPackagingAnswer,
  type PackagingQuestions,
  packagingQuestionsFor,
  type UnitCost,
} from "@/domain/couts";
import { checkDestinationSplit } from "@/domain/destinations";
import { commentRequiredFor, destinationAllowedIn } from "@/domain/devenirs";
import { CARTONS_SNACK_SUBZONE, CARTONS_TRAY_SUBZONE, snackAllowedIn } from "@/domain/encas";
import { lotsAllowedIn } from "@/domain/lots";
import { zoneNameWithoutNumber } from "@/domain/nom-zone";
import { CATALOG_ENTRY_ZONE_CODES, type FreePrice, freeCategoriesFor, freeUnitCost } from "@/domain/produit-absent";
import { materialsForPlace } from "@/domain/matieres";
import {
  countUnitLabel,
  gastroTareAllowed,
  type MeasureContext,
  methodLabel,
  methodsFor,
  packagingChoiceLabel,
  unitsFor,
} from "@/domain/saisie-mesure";
import { computeProductionWeek, formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { computeNetWeight } from "@/domain/tares";
import { convertToKg, type UnitKind } from "@/domain/unites";
import {
  INPUT_METHODS,
  type InputMethod,
  isNonFoodCategory,
  METHOD_LABELS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
} from "@/modules/declarations/input";
import type { DeclarationOptions } from "@/modules/declarations/options";
import type { WeekCatalog, WeekItemKind } from "@/modules/imports/catalog";
import { gramsToKg, SNACK_ZONE_CODES } from "@/modules/imports/merge";
import { isNetworkError, stamp } from "@/modules/declarations/offline-queue";
import { useOfflineQueue } from "../offline-provider";
import { proposeCauseAction, submitCorrection, submitDeclaration, type SubmitResult } from "./actions";
import { type LotLineText, LotsStep, lotsPayload, lotsSummary, type WizardPhoto } from "./lots-step";

type Step = "zone" | "subzone" | "team" | "product" | "quantity" | "lots" | "cause" | "destination" | "recap" | "done";
export type ProductChoice =
  | { kind: "listed"; id: string; name: string; category: string }
  | {
      kind: "free";
      name: string;
      category: (typeof PRODUCT_CATEGORIES)[number];
      price?: FreePrice | null;
      /** Réception, Stockage : fournisseur connu ou tapé (facultatif) ; l'article est ajouté « à valider ». */
      supplier?: { supplierId: string } | { supplierName: string } | null;
    }
  | {
      /** Produit de l'import de la semaine (plat, sous-recette ou ingrédient). */
      kind: "week";
      itemKind: WeekItemKind;
      id: string;
      name: string;
      category: string;
      unitWeightKg: number | null;
      /** Densité d'un ingrédient liquide (matière du référentiel). */
      densityKgPerL?: number | null;
      /** Semaine de production de l'import (le produit n'est valable que pour une perte de cette semaine). */
      week: { year: number; number: number };
      /** Coûts du tome de la semaine (matières ; emballages seulement pour un moule ou un plat à gratin vendu seul). */
      cost: CostInputs;
      /** Plat entier : moule (ou plat à gratin) et barquette par portion, comptés seulement s'ils sont jetés (R42). */
      dishPackaging?: { moulds: DishMould[]; trayPerPortionEur: number | null };
    };

/** État de départ d'une correction, construit à partir de la déclaration existante. */
export interface WizardInitial {
  zoneId: string;
  subzoneId: string;
  teamId: string | null;
  product: ProductChoice;
  method: InputMethod;
  quantity: string;
  unitCode: string | null;
  /** Colis fournisseur choisi (unité « colis »). */
  packagingKey?: string | null;
  /** Poids d'un colis indiqué ou corrigé à la saisie (texte, clavier français). */
  packagingKg?: string;
  useTare: boolean;
  grossKg: string;
  gastroCounts: Record<string, number>;
  supportId: string | null;
  causeId: string;
  destinationLines: { destinationId: string; quantity: string }[];
  /** Montants encaissés saisis pour les lignes de vente (en texte, clavier français). */
  recoveredAmounts?: Record<string, string>;
  /** N° de poubelle saisis (destinations qui le demandent). */
  binNumbers?: Record<string, string>;
  justification: string;
  occurredOn: string;
  occurredTime: string;
  comment: string;
  /** N° de lot, DLC (« JJ/MM/AAAA ») et quantité de chaque lot (Réception, Stockage). */
  lotLines?: LotLineText[];
  /** Photos du lot et de la DLC : déjà enregistrées (correction) ou prises sur l'appareil. */
  photos?: WizardPhoto[];
  /** Moule et barquette jetés avec le plat (salle blanche, salle des cartons). */
  discarded?: DiscardedPackaging;
}

/** Ligne préparée en mode « plusieurs pertes », gardée sur l'appareil jusqu'à la validation du lot. */
export interface BatchLine {
  payload: Record<string, unknown>;
  initial: WizardInitial;
  summary: {
    productName: string;
    quantityLabel: string;
    causeName: string;
    placeLabel: string;
    destinationLabel: string;
  };
}

interface Props {
  options: DeclarationOptions;
  userTeam: { letter: string; colorName: string; colorHex: string } | null;
  /** Mode correction : déclaration à corriger, version affichée et valeurs de départ. */
  correction?: { id: string; revision: number; initial: WizardInitial };
  /** Mode « plusieurs pertes » : la ligne est ajoutée à la liste au lieu d'être enregistrée. */
  batch?: {
    initial?: Partial<WizardInitial>;
    startStep?: "zone" | "product" | "recap";
    editing: boolean;
    onAdd: (line: BatchLine) => void;
    onCancel: () => void;
  };
}

const LAST_SUBZONE_KEY = "pertes:derniere-sous-zone";

const euroFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const fmtEuro = (n: number) => euroFormat.format(n);

/** Lit un nombre saisi au clavier français (virgule acceptée). */
function parseNumber(value: string): number | null {
  const n = Number.parseFloat(value.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const fmt = (n: number) => numberFormat.format(n);

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée) : simple confort, on ignore.
  }
}

export function DeclarationWizard({ options, userTeam, correction, batch }: Props) {
  const init: Partial<WizardInitial> | undefined = correction?.initial ?? batch?.initial;
  const [step, setStep] = useState<Step>(correction ? "recap" : (batch?.startStep ?? "zone"));
  const [zoneId, setZoneId] = useState<string | null>(init?.zoneId ?? null);
  const [subzoneId, setSubzoneId] = useState<string | null>(init?.subzoneId ?? null);
  const [teamId, setTeamId] = useState<string | null>(init?.teamId ?? null);
  const [product, setProduct] = useState<ProductChoice | null>(init?.product ?? null);
  const [method, setMethod] = useState<InputMethod | null>(init?.method ?? null);
  const [quantity, setQuantity] = useState(init?.quantity ?? "");
  const [unitCode, setUnitCode] = useState<string | null>(init?.unitCode ?? null);
  const [packagingKey, setPackagingKey] = useState<string | null>(init?.packagingKey ?? null);
  const [packagingKgText, setPackagingKgText] = useState(init?.packagingKg ?? "");
  const [useTare, setUseTareState] = useState(init?.useTare ?? false);
  /** Pesée là où les gastros existent : « gastros » (tare déduite) ou « net » (poids net saisi), à choisir. */
  const [weighChoice, setWeighChoice] = useState<"gastros" | "net" | null>(
    init?.useTare ? "gastros" : init ? "net" : null,
  );
  const setUseTare = (v: boolean) => {
    setUseTareState(v);
    setWeighChoice(v ? "gastros" : null);
  };
  const [grossKg, setGrossKg] = useState(init?.grossKg ?? "");
  const [gastroCounts, setGastroCounts] = useState<Record<string, number>>(init?.gastroCounts ?? {});
  const [supportId, setSupportId] = useState<string | null>(init?.supportId ?? null);
  const [causeId, setCauseId] = useState<string | null>(init?.causeId ?? null);
  const [splitMode, setSplitMode] = useState((init?.destinationLines?.length ?? 0) > 1);
  const [destinationLines, setDestinationLines] = useState<{ destinationId: string; quantity: string }[]>(
    init?.destinationLines ?? [],
  );
  const [justification, setJustification] = useState(init?.justification ?? "");
  const [recoveredAmounts, setRecoveredAmounts] = useState<Record<string, string>>(init?.recoveredAmounts ?? {});
  const [binNumbers, setBinNumbers] = useState<Record<string, string>>(init?.binNumbers ?? {});
  const [occurredOn, setOccurredOn] = useState(init?.occurredOn ?? options.today);
  /**
   * Date du jour : celle de l'appareil quand la page vient d'une copie gardée pour la saisie hors ligne (étape 6.6)
   * et date d'un jour précédent.
   */
  const [today, setToday] = useState(options.today);
  useEffect(() => {
    const local = toProductionLocalDate(new Date());
    if (local <= options.today) return;
    // Date de l'appareil, connue seulement dans le navigateur (pas au rendu serveur) : lue après l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(local);
    if (!init?.occurredOn) setOccurredOn(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.today]);
  const [occurredTime, setOccurredTime] = useState(init?.occurredTime ?? "");
  const [comment, setComment] = useState(init?.comment ?? "");
  const [lotLines, setLotLines] = useState<LotLineText[]>(init?.lotLines ?? []);
  const [photos, setPhotos] = useState<WizardPhoto[]>(init?.photos ?? []);
  const [discarded, setDiscarded] = useState<DiscardedPackaging>(init?.discarded ?? {});
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  /** Perte gardée sur l'appareil faute de réseau (envoyée au retour du réseau). */
  const [queued, setQueued] = useState(false);
  /** Identifiant et heure de saisie de la perte en cours : gardés si l'envoi est refait. */
  const [entry, setEntry] = useState<{ clientId: string; enteredAt: string } | null>(null);
  const offlineQueue = useOfflineQueue();
  const [lastSubzoneId, setLastSubzoneId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Stockage du navigateur, absent au rendu serveur : lu après l'hydratation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLastSubzoneId(readStorage(LAST_SUBZONE_KEY)), []);

  const zone = options.zones.find((z) => z.id === zoneId) ?? null;
  const subzone = zone?.subzones.find((sz) => sz.id === subzoneId) ?? null;
  const needsTeam = subzone?.teamMode === "equipe" && !userTeam;
  const team = options.teams.find((t) => t.id === teamId) ?? null;
  const isConsumable = !!product && isNonFoodCategory(product.category);

  const steps: Step[] = [
    "zone",
    ...(zone && zone.subzones.length > 1 ? (["subzone"] as const) : []),
    ...(needsTeam ? (["team"] as const) : []),
    "product",
    "quantity",
    ...(zone && lotsAllowedIn(zone.code) ? (["lots"] as const) : []),
    "cause",
    "destination",
    "recap",
  ];
  const stepIndex = steps.indexOf(step);
  const goNext = (from: Step) => {
    const next = steps[steps.indexOf(from) + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    const previous = steps[stepIndex - 1];
    if (previous) setStep(previous);
  };

  // Zones toujours dans le même ordre (marche en avant, numérotées) ; la dernière utilisée est seulement signalée.
  const lastZoneId = options.zones.find((z) => z.subzones.some((sz) => sz.id === lastSubzoneId))?.id;

  // ─── Calculs en direct (le serveur refait tous les contrôles) ───────────────
  const gastros = options.containers.filter((c) => c.kind === "gastro");
  const supports = options.containers.filter((c) => c.kind === "support");
  const tarePreview = useMemo(() => {
    if (!useTare) return null;
    const gross = parseNumber(grossKg);
    const lines = gastros
      .filter((g) => (gastroCounts[g.id] ?? 0) > 0)
      .map((g) => ({
        containerTypeId: g.id,
        tareId: g.id,
        unitTareKg: g.unitTareKg,
        count: gastroCounts[g.id]!,
        maxCount: g.maxCount,
      }));
    const support = supports.find((sp) => sp.id === supportId);
    if (gross == null) return { error: null, result: null };
    try {
      return {
        error: null,
        result: computeNetWeight({
          grossKg: gross,
          gastros: lines,
          support: support ? { containerTypeId: support.id, tareId: support.id, unitTareKg: support.unitTareKg } : null,
        }),
      };
    } catch (e) {
      return { error: (e as Error).message, result: null };
    }
  }, [useTare, grossKg, gastroCounts, supportId, gastros, supports]);

  const listedProduct = product?.kind === "listed" ? options.products.find((p) => p.id === product.id) : undefined;
  const unit = options.units.find((u) => u.code === unitCode);
  // Façons de mesurer permises dans ce lieu pour ce produit (règle R25 ; le serveur refait le contrôle).
  const productPackagings = listedProduct ? (options.packagings[listedProduct.id] ?? []) : [];
  const packaging = unitCode === "colis" ? (productPackagings.find((k) => k.key === packagingKey) ?? null) : null;
  // Poids d'un colis : celui du colis choisi, corrigeable (cartons de 2 kg reçus au lieu de 3 kg), ou indiqué.
  const packagingKg = unitCode === "colis" ? parseNumber(packagingKgText) : null;
  const measureContext: MeasureContext = {
    zoneCode: zone?.code ?? "",
    subzoneCode: subzone?.code ?? null,
    isConsumable,
    pieceWeightKnown: (product?.kind === "week" ? product.unitWeightKg : listedProduct?.unitWeightKg) != null,
    isSnack: product?.category === "produit_externe",
    // Sous-recette du tome de la semaine (un produit absent de la liste se rattache plus tard, avec son poids).
    isSubRecipe: product?.kind === "week" && product.category === "sous_recette",
    hasPackaging: productPackagings.length > 0,
  };
  const methods = methodsFor(INPUT_METHODS, measureContext);
  const net = ((): { quantity: number; unitCode: string; kg: number | null; note?: string } | null => {
    if (useTare) {
      const r = tarePreview?.result;
      return r ? { quantity: r.netKg, unitCode: "kg", kg: r.netKg } : null;
    }
    const q = parseNumber(quantity);
    if (q == null || q <= 0 || !unit) return null;
    if (unit.code === "colis") {
      return packagingKg != null && packagingKg > 0
        ? { quantity: q, unitCode: "colis", kg: Math.round(q * packagingKg * 10_000) / 10_000 }
        : null;
    }
    const conversion = convertToKg(
      q,
      { code: unit.code, kind: unit.kind as UnitKind, toBaseFactor: unit.toBaseFactor },
      {
        isConsumable,
        unitWeightKg: product?.kind === "week" ? product.unitWeightKg : listedProduct?.unitWeightKg,
        densityKgPerL: product?.kind === "week" ? product.densityKgPerL : listedProduct?.densityKgPerL,
      },
    );
    return { quantity: q, unitCode: unit.code, kg: conversion.netKg, note: conversion.reason };
  })();

  const unitLabel = (code: string) =>
    countUnitLabel(code, measureContext) ?? options.units.find((u) => u.code === code)?.label ?? code;
  // Poids d'une barquette ou d'un encas compté en salle des cartons, rappelé sous la quantité.
  const countedUnitKg =
    zone?.code === "CONDITIONNEMENT" && (unitCode === "barquette" || unitCode === "piece") && !isConsumable
      ? ((product?.kind === "week" ? product.unitWeightKg : listedProduct?.unitWeightKg) ?? null)
      : null;
  const netLabel = net ? `${fmt(net.quantity)} ${unitLabel(net.unitCode)}` : "";

  const split = (() => {
    if (!net || destinationLines.length === 0) return null;
    const lines = destinationLines
      .map((l) => ({ destinationId: l.destinationId, quantity: parseNumber(l.quantity) ?? 0 }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) return null;
    try {
      return checkDestinationSplit(net.quantity, lines);
    } catch {
      return null;
    }
  })();

  const causes = options.causes.filter(
    (c) =>
      c.isOther ||
      (zone &&
        c.zoneIds.includes(zone.id) &&
        (c.subzoneIds.length === 0 || (subzone && c.subzoneIds.includes(subzone.id)))),
  );

  const isLate =
    occurredOn && occurredOn <= today
      ? computeProductionWeek(occurredOn).startDate < computeProductionWeek(today).startDate
      : false;

  // Coût matière estimé d'après le tome de la semaine (le serveur refait le calcul et le fige).
  // Produit absent de la liste : le prix d'achat indiqué (décision du 20/11/2026).
  const listedPrice = listedProduct
    ? (options.prices[listedProduct.id] ?? null)
    : product?.kind === "free" && product.price
      ? freeUnitCost(product.price)
      : null;
  const pricedProduct = !!listedProduct || (product?.kind === "free" && !!product.price);
  // Moule et barquette jetés avec un plat entier : demandés en salle blanche et en salle des cartons (R42).
  const packagingQuestions = packagingQuestionsFor(
    { zoneCode: zone?.code ?? "", subzoneCode: subzone?.code ?? null },
    {
      wholeDish: product?.kind === "week" && !!product.dishPackaging,
      moulds: product?.kind === "week" ? (product.dishPackaging?.moulds ?? null) : null,
    },
  );
  const packagingMissing = missingPackagingAnswer(packagingQuestions, discarded);
  const costPreview =
    product?.kind === "week" && net
      ? lossCostBreakdown(
          { netKg: net.kg, quantity: net.quantity, unitCode: net.unitCode },
          product.dishPackaging
            ? {
                ...product.cost,
                packagingPerPortionEur: discardedPackagingPerPortion(
                  packagingQuestions,
                  discarded,
                  product.dishPackaging.trayPerPortionEur,
                ),
              }
            : product.cost,
        )
      : listedPrice && net && product?.category !== "moule_plat_gratin"
        ? lossCostBreakdown(
            { netKg: net.kg, quantity: net.quantity, unitCode: net.unitCode },
            { food: listedPrice, packagingPerPortionEur: null, portionWeightKg: null },
          )
        : null;

  const isSale = (destinationId: string) =>
    options.destinations.find((d) => d.id === destinationId)?.financialRecovery ?? false;
  // N° de poubelle (Les Alchimistes) : facultatif ou obligatoire selon la destination, prérempli avec le dernier n° noté dans la zone.
  const binMode = (destinationId: string) =>
    options.destinations.find((d) => d.id === destinationId)?.binNumberMode ?? "aucun";
  const needsBin = (destinationId: string) => binMode(destinationId) !== "aucun";
  const binOf = (destinationId: string) =>
    binNumbers[destinationId] ?? (zone ? options.lastBinNumbers[zone.id]?.[destinationId] : undefined) ?? "";
  const binLines = destinationLines.filter((l) => needsBin(l.destinationId) && (parseNumber(l.quantity) ?? 0) > 0);
  const missingBin = binLines.some((l) => binMode(l.destinationId) === "obligatoire" && !binOf(l.destinationId).trim());
  const saleLines = destinationLines.filter((l) => isSale(l.destinationId));
  const recoveredTotal = saleLines.reduce(
    (sum, l) => sum + (parseNumber(recoveredAmounts[l.destinationId] ?? "") ?? 0),
    0,
  );

  // Un produit de la semaine n'est valable que pour une perte de cette semaine de production.
  const occurredWeek = occurredOn ? computeProductionWeek(occurredOn) : null;
  const productWeekMismatch =
    product?.kind === "week" &&
    occurredWeek != null &&
    (product.week.year !== occurredWeek.year || product.week.number !== occurredWeek.number);
  const catalogForDate =
    options.weekCatalogs.find(
      (c) => occurredWeek && c.year === occurredWeek.year && c.number === occurredWeek.number,
    ) ?? null;

  // ─── Actions ────────────────────────────────────────────────────────────────
  function chooseZone(id: string) {
    const z = options.zones.find((x) => x.id === id)!;
    setZoneId(id);
    setCauseId(null);
    if (z.subzones.length === 1) {
      chooseSubzone(z.subzones[0]!.id, z);
    } else {
      setSubzoneId(null);
      setStep("subzone");
    }
  }

  function chooseSubzone(id: string, z = zone) {
    setSubzoneId(id);
    setCauseId(null);
    writeStorage(LAST_SUBZONE_KEY, id);
    setLastSubzoneId(id);
    const sz = z?.subzones.find((x) => x.id === id);
    setStep(sz?.teamMode === "equipe" && !userTeam ? "team" : "product");
  }

  function chooseMethod(m: InputMethod) {
    setMethod(m);
    setUseTare(false);
    chooseUnit(unitsFor(m, measureContext)[0] ?? null);
  }

  function chooseUnit(code: string | null) {
    setUnitCode(code);
    const first = code === "colis" ? (productPackagings[0] ?? null) : null;
    setPackagingKey(first?.key ?? null);
    setPackagingKgText(first ? String(first.kg).replace(".", ",") : "");
  }

  // Devenirs de la zone (décision du 19/11/2026) ; une correction garde ceux déjà sur la perte.
  const keptDestinationIds = init?.destinationLines?.map((l) => l.destinationId) ?? [];
  const zoneDestinations = options.destinations.filter(
    (d) => destinationAllowedIn(d.kind, zone?.code ?? "") || keptDestinationIds.includes(d.id),
  );
  const commentNeeded = commentRequiredFor(
    destinationLines
      .filter((l) => l.quantity)
      .map((l) => options.destinations.find((d) => d.id === l.destinationId)?.kind ?? ""),
  );
  const commentMissing = commentNeeded && !comment.trim();

  function chooseSingleDestination(destinationId: string) {
    if (!net) return;
    setSplitMode(false);
    setDestinationLines([{ destinationId, quantity: String(net.quantity) }]);
    setJustification("");
    // « Autre destination » : on reste ici pour écrire le commentaire qui la précise.
    if (options.destinations.find((d) => d.id === destinationId)?.kind !== "autre") setStep("recap");
  }

  function resetForNext(keepPlace: boolean) {
    setProduct(null);
    setMethod(null);
    setQuantity("");
    setUnitCode(null);
    setPackagingKey(null);
    setUseTare(false);
    setGrossKg("");
    setGastroCounts({});
    setSupportId(null);
    setCauseId(null);
    setSplitMode(false);
    setDestinationLines([]);
    setJustification("");
    setComment("");
    setLotLines([]);
    setPhotos([]);
    setOccurredTime("");
    setResult(null);
    setQueued(false);
    setEntry(null);
    if (keepPlace) {
      setStep("product");
    } else {
      setZoneId(null);
      setSubzoneId(null);
      setTeamId(null);
      setStep("zone");
    }
  }

  function submit() {
    if (!zone || !subzone || !product || !method || !causeId || !net) return;
    const payload = {
      occurredOn,
      occurredTime: occurredTime || null,
      subzoneId: subzone.id,
      teamId: needsTeam ? teamId : null,
      product:
        product.kind === "listed"
          ? { productId: product.id }
          : product.kind === "week"
            ? { weekItem: { kind: product.itemKind, id: product.id } }
            : {
                freeLabel: product.name,
                category: product.category,
                price: product.price ?? null,
                ...(product.supplier ? { supplier: product.supplier } : {}),
              },
      method,
      quantity: useTare ? null : net.quantity,
      unitCode: useTare ? null : unitCode,
      packagingKey: !useTare && unitCode === "colis" ? packagingKey : null,
      // Poids envoyé seulement s'il diffère du colis choisi, ou s'il n'y a pas de colis connu.
      packagingKg:
        !useTare &&
        unitCode === "colis" &&
        packagingKg != null &&
        (!packaging || Math.abs(packagingKg - packaging.kg) > 0.0005)
          ? packagingKg
          : null,
      tare: useTare
        ? {
            grossKg: parseNumber(grossKg),
            gastros: Object.entries(gastroCounts)
              .filter(([, n]) => n > 0)
              .map(([containerTypeId, count]) => ({ containerTypeId, count })),
            supportTypeId: supportId,
          }
        : null,
      causeId,
      destinations: destinationLines
        .map((l) => ({
          destinationId: l.destinationId,
          quantity: parseNumber(l.quantity) ?? 0,
          recoveredAmountEur: isSale(l.destinationId) ? parseNumber(recoveredAmounts[l.destinationId] ?? "") : null,
          binNumber: needsBin(l.destinationId) ? binOf(l.destinationId).trim() || null : null,
        }))
        .filter((l) => l.quantity > 0),
      destinationGapJustification: justification || null,
      comment: comment || null,
      discarded: asksPackaging(packagingQuestions) ? discarded : null,
      ...(zone && lotsAllowedIn(zone.code)
        ? {
            lots: lotsPayload(lotLines, net.quantity, today),
            // Série : pas de photos (envoi groupé trop lourd).
            photos: batch ? [] : photos.map((p) => (p.photoId ? { photoId: p.photoId } : { dataUrl: p.dataUrl! })),
          }
        : {}),
    };
    if (batch) {
      batch.onAdd({
        payload,
        initial: {
          zoneId: zone.id,
          subzoneId: subzone.id,
          teamId,
          product,
          method,
          quantity,
          unitCode,
          packagingKey,
          packagingKg: packagingKgText,
          useTare,
          grossKg,
          gastroCounts,
          supportId,
          causeId,
          destinationLines,
          recoveredAmounts,
          binNumbers: Object.fromEntries(binLines.map((l) => [l.destinationId, binOf(l.destinationId).trim()])),
          justification,
          occurredOn,
          occurredTime,
          comment,
          lotLines,
          discarded,
        },
        summary: {
          productName: product.name,
          quantityLabel: net.kg != null && net.unitCode !== "kg" ? `${netLabel} (${fmt(net.kg)} kg)` : netLabel,
          causeName: options.causes.find((c) => c.id === causeId)?.name ?? "",
          placeLabel: [zone.subzones.length > 1 ? subzone.name : zone.name, team ? `Équipe ${team.letter}` : null]
            .filter(Boolean)
            .join(" · "),
          destinationLabel: destinationLines
            .map((l) => options.destinations.find((d) => d.id === l.destinationId)?.name)
            .join(", "),
        },
      });
      return;
    }
    startTransition(async () => {
      if (correction) {
        try {
          const r = await submitCorrection({
            id: correction.id,
            expectedRevision: correction.revision,
            reason,
            payload,
          });
          setResult(r);
          if (r.ok) setStep("done");
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          offlineQueue.markOffline();
          setResult({
            ok: false,
            error: "Pas de réseau : la correction n'a pas été envoyée. Réessayez au retour du réseau.",
          });
        }
        return;
      }
      // Saisie hors ligne (docs/PHASE6.md, étape 6.5) : sans réseau, la perte est gardée sur l'appareil.
      const sent = stamp({ ...payload, ...entry });
      setEntry({ clientId: sent.clientId, enteredAt: sent.enteredAt });
      const keep = async () => {
        await offlineQueue.enqueue({
          id: sent.clientId,
          kind: "une",
          payloads: [sent],
          summary: [netLabel, product?.name, options.causes.find((c) => c.id === causeId)?.name]
            .filter(Boolean)
            .join(" — "),
          enteredAt: sent.enteredAt,
        });
        offlineQueue.markOffline();
        setQueued(true);
        setStep("done");
      };
      if (!navigator.onLine) return keep();
      let r: SubmitResult;
      try {
        r = await submitDeclaration(sent);
      } catch (e) {
        if (isNetworkError(e)) return keep();
        throw e;
      }
      setResult(r);
      if (r.ok) setStep("done");
    });
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  if (step === "done" && queued) {
    return (
      <div className="flex flex-col gap-6">
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-2xl bg-amber-50 p-6 text-center text-amber-950"
        >
          <span
            aria-hidden
            className="flex size-16 items-center justify-center rounded-full bg-amber-500 text-4xl text-white"
          >
            ⏳
          </span>
          <p className="text-xl font-semibold">Perte gardée sur cet appareil</p>
          <p>
            {netLabel} — {product?.name}
          </p>
          <p className="text-sm">
            Pas de réseau : elle sera envoyée toute seule au retour du réseau. Ne videz pas les données du navigateur
            d&apos;ici là.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => resetForNext(true)}>
          Nouvelle perte — même endroit
        </button>
        <button type="button" className="btn-secondary" onClick={() => resetForNext(false)}>
          Nouvelle perte — autre endroit
        </button>
        <Link href="/declarer/en-attente" className="text-center text-slate-600 underline">
          Voir les pertes en attente
        </Link>
      </div>
    );
  }

  if (step === "done" && result?.ok) {
    const d = result.declaration;
    const cause = options.causes.find((c) => c.id === causeId);
    return (
      <div className="flex flex-col gap-6">
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-2xl bg-emerald-50 p-6 text-center text-emerald-900"
        >
          <span
            aria-hidden
            className="flex size-16 items-center justify-center rounded-full bg-emerald-600 text-4xl text-white"
          >
            ✓
          </span>
          <p className="text-xl font-semibold">{correction ? "Correction enregistrée" : "Perte enregistrée"}</p>
          <p>
            {fmt(d.netQuantity)} {unitLabel(d.netUnitCode)}
            {d.netKg != null && d.netUnitCode !== "kg" && ` (${fmt(d.netKg)} kg)`} — {product?.name}
          </p>
          <p className="text-sm">{cause?.name}</p>
          {d.isLate && <p className="text-sm font-medium text-amber-800">Déclaration tardive (semaine précédente)</p>}
        </div>
        {correction ? (
          <Link href={`/historique/${correction.id}`} className="btn-primary flex items-center justify-center">
            Voir la déclaration et ses versions
          </Link>
        ) : (
          <>
            <button type="button" className="btn-primary" onClick={() => resetForNext(true)}>
              Nouvelle perte — même endroit
            </button>
            <button type="button" className="btn-secondary" onClick={() => resetForNext(false)}>
              Nouvelle perte — autre endroit
            </button>
          </>
        )}
        <Link href="/" className="text-center text-slate-600 underline">
          Terminer
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {today !== options.today && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          Listes gardées sur cet appareil le{" "}
          {new Date(`${options.today}T12:00:00Z`).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}{" "}
          : sans réseau, les plats proposés peuvent dater d&apos;une autre semaine. La perte sera vérifiée à
          l&apos;envoi.
        </p>
      )}
      <div className="flex items-center justify-between">
        {batch && (stepIndex === 0 || step === "recap" || step === (batch.startStep ?? "zone")) ? (
          <button type="button" onClick={batch.onCancel} className="rounded-xl px-2 py-2 font-medium text-slate-700">
            ← Liste
          </button>
        ) : stepIndex > 0 ? (
          <button type="button" onClick={goBack} className="rounded-xl px-2 py-2 font-medium text-slate-700">
            ← Retour
          </button>
        ) : (
          <Link
            href={correction ? `/historique/${correction.id}` : "/"}
            className="rounded-xl px-2 py-2 font-medium text-slate-700"
          >
            {correction ? "← Annuler la correction" : "← Accueil"}
          </Link>
        )}
        <span className="text-sm text-slate-500">
          Étape {stepIndex + 1} / {steps.length}
        </span>
      </div>

      <Breadcrumb
        items={[
          zone?.name,
          zone && zone.subzones.length > 1 ? subzone?.name : null,
          team ? `Équipe ${team.letter}` : null,
          product?.name,
          step !== "quantity" && net ? netLabel : null,
        ]}
      />

      {step === "zone" && (
        <Section title="Où a eu lieu la perte ?">
          {/* Logigramme de haut en bas, dans le sens de la marche en avant (décision du 20/11/2026). */}
          <ol className="flex flex-col items-stretch" aria-label="Zones, dans le sens de la marche en avant">
            {options.zones.map((z, i) => (
              <li key={z.id} className="flex flex-col items-stretch">
                {i > 0 && (
                  <span aria-hidden className="flex h-5 flex-col items-center">
                    <span className="w-0.5 flex-1 bg-brun-100" />
                    <span className="-mt-1.5 text-sm leading-none text-brun-600">▼</span>
                  </span>
                )}
                <Tile onClick={() => chooseZone(z.id)} selected={z.id === zoneId} disabled={z.allowed === false}>
                  {z.number ? `${z.number}. ${zoneNameWithoutNumber(z.name)}` : z.name}
                  {z.id === lastZoneId && <small className="font-normal opacity-80">Dernière utilisée</small>}
                  {z.allowed === false && <small className="font-normal">Pas dans vos zones</small>}
                </Tile>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {step === "subzone" && zone && (
        <Section title={`${zone.name} : quel poste ?`}>
          <TileGrid>
            {zone.subzones.map((sz) => (
              <Tile key={sz.id} onClick={() => chooseSubzone(sz.id)} selected={sz.id === subzoneId}>
                {sz.name}
                {sz.description && <small className="font-normal opacity-80">{sz.description}</small>}
              </Tile>
            ))}
          </TileGrid>
        </Section>
      )}

      {step === "team" && (
        <Section title="Quelle équipe ?">
          <TileGrid>
            {options.teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTeamId(t.id);
                  setStep("product");
                }}
                aria-pressed={t.id === teamId}
                className="flex min-h-16 items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left text-lg font-semibold"
                style={{ borderColor: t.colorHex }}
              >
                <span
                  aria-hidden
                  className="flex size-10 items-center justify-center rounded-full text-xl text-white"
                  style={{ backgroundColor: t.colorHex }}
                >
                  {t.letter}
                </span>
                Équipe {t.letter} – {t.colorName}
              </button>
            ))}
          </TileGrid>
        </Section>
      )}

      {step === "product" && (
        <ProductStep
          products={options.products}
          catalogs={options.weekCatalogs}
          weekMaterials={options.weekMaterials}
          packagings={options.packagings}
          suppliers={options.suppliers}
          supplierList={options.supplierList}
          materialCategories={options.materialCategories}
          zoneCode={zone?.code ?? ""}
          materialPlace={
            zone && subzone && MATERIAL_ZONE_CODES.includes(zone.code)
              ? { zoneCode: zone.code, subzoneId: subzone.id, subzoneName: subzone.name }
              : null
          }
          initialWeek={occurredWeek}
          initialCatalog={catalogForDate}
          packagingPerPortion={options.packagingPerPortion}
          dishScope={
            subzone?.teamMode === "equipe"
              ? "equipe"
              : zone?.code === "CONDITIONNEMENT" && subzone?.code !== CARTONS_SNACK_SUBZONE
                ? "toutes"
                : null
          }
          showSnacks={!!zone && SNACK_ZONE_CODES.includes(zone.code) && subzone?.code !== CARTONS_TRAY_SUBZONE}
          onlySnacks={subzone?.code === CARTONS_SNACK_SUBZONE}
          subzoneCode={subzone?.code ?? null}
          teamId={teamId}
          onChoose={(p) => {
            setProduct(p);
            setDiscarded({});
            setMethod(null);
            setUseTare(false);
            // Une seule façon de mesurer (pesée en Cuisine/production) : déjà choisie.
            const ctx = {
              ...measureContext,
              isConsumable: isNonFoodCategory(p.category),
              isSnack: p.category === "produit_externe",
            };
            const only = methodsFor(INPUT_METHODS, ctx);
            if (only.length === 1) {
              setMethod(only[0]!);
              setUnitCode(unitsFor(only[0]!, ctx)[0] ?? null);
            }
            setStep("quantity");
          }}
        />
      )}

      {step === "quantity" && (
        <Section title="Quelle quantité ?">
          <TileGrid>
            {methods.map((m) => (
              <Tile key={m} onClick={() => chooseMethod(m)} selected={m === method} compact>
                {methodLabel(m, zone?.code ?? "", METHOD_LABELS[m], methods.indexOf(m), measureContext)}
              </Tile>
            ))}
          </TileGrid>

          {method && asksPackaging(packagingQuestions) && product?.kind === "week" && product.dishPackaging && (
            <PackagingStep
              questions={packagingQuestions}
              answers={discarded}
              trayPerPortionEur={product.dishPackaging.trayPerPortionEur}
              onChange={setDiscarded}
            />
          )}

          {method === "pesee" && gastroTareAllowed(measureContext) && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-medium">Comment avez-vous pesé ?</legend>
              <TileGrid>
                <Tile compact selected={weighChoice === "gastros"} onClick={() => setUseTare(true)}>
                  Pesé dans des gastros
                  <small className="font-normal opacity-80">La tare des gastros est déduite</small>
                </Tile>
                <Tile
                  compact
                  selected={weighChoice === "net"}
                  onClick={() => {
                    setUseTareState(false);
                    setWeighChoice("net");
                  }}
                >
                  Poids net
                  <small className="font-normal opacity-80">Saisi directement, sans contenant</small>
                </Tile>
              </TileGrid>
            </fieldset>
          )}

          {method &&
            !useTare &&
            !(method === "pesee" && gastroTareAllowed(measureContext) && weighChoice !== "net") && (
              <div className="flex gap-2">
                <input
                  className="field min-w-0 flex-1"
                  inputMode="decimal"
                  placeholder="Quantité"
                  aria-label="Quantité"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoFocus
                />
                <select
                  className="field"
                  aria-label="Unité"
                  value={unitCode ?? ""}
                  onChange={(e) => chooseUnit(e.target.value)}
                >
                  {unitsFor(method, measureContext).map((code) => (
                    <option key={code} value={code}>
                      {unitLabel(code)}
                    </option>
                  ))}
                </select>
              </div>
            )}

          {method && !useTare && countedUnitKg != null && (
            <p className="text-sm text-slate-600">
              1 {unitCode === "barquette" ? "barquette" : "encas"} = {fmt(Math.round(countedUnitKg * 1000))} g
              {unitCode === "barquette" ? " (poids de la barquette pour ce plat)" : " (poids d'un encas)"}
            </p>
          )}

          {method && !useTare && unitCode === "colis" && (
            <div className="flex flex-col gap-2 rounded-xl bg-white p-3">
              {productPackagings.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Colis du fournisseur</span>
                  <select
                    className="field"
                    value={packagingKey ?? ""}
                    onChange={(e) => {
                      const k = productPackagings.find((x) => x.key === e.target.value) ?? null;
                      setPackagingKey(k?.key ?? null);
                      if (k) setPackagingKgText(String(k.kg).replace(".", ","));
                    }}
                  >
                    {productPackagings.map((k) => (
                      <option key={k.key} value={k.key}>
                        {packagingChoiceLabel(
                          { packagingLabel: k.label, contentQuantity: null, contentUnit: null, supplier: k.supplier },
                          k.kg,
                        )}
                        {k.source === "manuel" ? " · saisi à la main" : ""}
                      </option>
                    ))}
                    <option value="">Autre colis (poids à indiquer)</option>
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="font-medium">Poids d&apos;un colis (kg)</span>
                <input
                  className="field"
                  inputMode="decimal"
                  value={packagingKgText}
                  onChange={(e) => setPackagingKgText(e.target.value)}
                  placeholder="ex. 2"
                />
              </label>
              {packaging && packagingKg != null && Math.abs(packagingKg - packaging.kg) > 0.0005 && (
                <p className="text-sm text-amber-800">
                  Colis différent de l&apos;habitude : {fmt(packagingKg)} kg au lieu de {fmt(packaging.kg)} kg.
                </p>
              )}
              {!packaging && (
                <p className="text-sm text-slate-500">
                  {productPackagings.length ? "" : "Aucun colis connu pour ce produit : "}indiquez le poids d&apos;un
                  colis.
                </p>
              )}
            </div>
          )}

          {method && useTare && (
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-medium">Pesé sur une échelle ?</legend>
                <TileGrid>
                  <Tile compact selected={supportId === null} onClick={() => setSupportId(null)}>
                    Sans échelle
                  </Tile>
                  {supports.map((sp) => (
                    <Tile key={sp.id} compact selected={supportId === sp.id} onClick={() => setSupportId(sp.id)}>
                      {sp.name}
                      <small className="font-normal opacity-80">{fmt(sp.unitTareKg)} kg</small>
                    </Tile>
                  ))}
                </TileGrid>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-medium">Nombre de gastros par type</legend>
                {gastros.map((g) => (
                  <Stepper
                    key={g.id}
                    label={g.name}
                    hint={`${fmt(g.unitTareKg)} kg pièce`}
                    value={gastroCounts[g.id] ?? 0}
                    max={g.maxCount ?? 99}
                    onChange={(n) => setGastroCounts((prev) => ({ ...prev, [g.id]: n }))}
                  />
                ))}
              </fieldset>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Poids brut affiché par la balance (kg)</span>
                <input
                  className="field"
                  inputMode="decimal"
                  value={grossKg}
                  onChange={(e) => setGrossKg(e.target.value)}
                />
              </label>
              {tarePreview?.error && <p className="rounded-xl bg-red-50 p-3 text-red-800">{tarePreview.error}</p>}
              {tarePreview?.result && (
                <p className="rounded-xl bg-white p-3 text-lg">
                  Tare {fmt(tarePreview.result.tareTotalKg)} kg —{" "}
                  <strong>Net {fmt(tarePreview.result.netKg)} kg</strong>
                </p>
              )}
            </div>
          )}

          {net && !useTare && (
            <p className="rounded-xl bg-white p-3">
              {net.kg != null && net.unitCode !== "kg" ? (
                <>
                  Soit <strong>{fmt(net.kg)} kg</strong>
                  {(pricedProduct || product?.kind === "week") && costPreview?.grossEur != null && (
                    <> · ≈ {fmtEuro(costPreview.grossEur)}</>
                  )}
                  {costPreview?.packagingEur ? <> (dont emballages {fmtEuro(costPreview.packagingEur)})</> : null}
                </>
              ) : net.kg != null && (pricedProduct || product?.kind === "week") && costPreview?.grossEur != null ? (
                <>
                  ≈ {fmtEuro(costPreview.grossEur)}
                  {costPreview.packagingEur ? <> (dont emballages {fmtEuro(costPreview.packagingEur)})</> : null}
                </>
              ) : (
                (net.note ?? (isConsumable ? "Consommable : compté en unités, pas en kg alimentaires." : null))
              )}
            </p>
          )}

          <button
            type="button"
            className="btn-primary"
            disabled={!net || !!packagingMissing}
            onClick={() => {
              // Une seule destination : elle suit la nouvelle quantité (cas d'une correction).
              if (net && destinationLines.length === 1) {
                setDestinationLines([
                  { destinationId: destinationLines[0]!.destinationId, quantity: String(net.quantity) },
                ]);
              }
              goNext("quantity");
            }}
          >
            Continuer
          </button>
        </Section>
      )}

      {step === "lots" && net && (
        <LotsStep
          total={net.quantity}
          unitLabel={unitLabel(net.unitCode)}
          today={today}
          lines={lotLines}
          onLinesChange={setLotLines}
          photos={batch ? null : photos}
          onPhotosChange={setPhotos}
          onContinue={() => goNext("lots")}
        />
      )}

      {step === "cause" && (
        <Section title="Pourquoi ?">
          <div className="flex flex-col gap-2">
            {causes.map((c) => (
              <Tile
                key={c.id}
                compact
                selected={c.id === causeId}
                onClick={() => {
                  setCauseId(c.id);
                  // « Autres causes » : on reste ici pour écrire le commentaire qui explique la perte.
                  if (!c.isOther) setStep("destination");
                }}
              >
                {c.name}
                {c.description && <small className="font-normal opacity-80">{c.description}</small>}
              </Tile>
            ))}
          </div>
          {causes.find((c) => c.id === causeId)?.isOther && (
            <div className="flex flex-col gap-2 rounded-xl bg-white p-3">
              <label className="flex flex-col gap-1">
                <span className="font-medium">Expliquez la perte (commentaire)</span>
                <textarea
                  className="field min-h-24 py-2"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  placeholder="Ce qui s'est passé"
                  autoFocus
                />
              </label>
              <button type="button" className="btn-primary" onClick={() => setStep("destination")}>
                Continuer
              </button>
            </div>
          )}
          <p className="text-sm text-slate-500">
            Aucune cause ne correspond ? Choisissez « Autres causes » et expliquez en commentaire.
          </p>
          {zone && <ProposeCause zoneId={zone.id} zoneName={zone.name} />}
        </Section>
      )}

      {step === "destination" && net && (
        <Section title={`Où part la perte (${netLabel}) ?`}>
          {!splitMode ? (
            <>
              <TileGrid>
                {zoneDestinations.map((d) => (
                  <Tile
                    key={d.id}
                    compact
                    selected={destinationLines.length === 1 && destinationLines[0]!.destinationId === d.id}
                    onClick={() => chooseSingleDestination(d.id)}
                  >
                    {d.name}
                  </Tile>
                ))}
              </TileGrid>
              {commentNeeded && (
                <div className="flex flex-col gap-2 rounded-xl bg-white p-3">
                  <OtherDestinationComment value={comment} onChange={setComment} />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={commentMissing}
                    onClick={() => setStep("recap")}
                  >
                    Continuer
                  </button>
                </div>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSplitMode(true);
                  setDestinationLines([]);
                }}
              >
                Répartir entre plusieurs destinations
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {zoneDestinations.map((d) => {
                const line = destinationLines.find((l) => l.destinationId === d.id);
                return (
                  <label key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                    <span className="font-medium">{d.name}</span>
                    <input
                      className="field w-28 text-right"
                      inputMode="decimal"
                      aria-label={`Quantité pour ${d.name}`}
                      value={line?.quantity ?? ""}
                      onChange={(e) =>
                        setDestinationLines((prev) => [
                          ...prev.filter((l) => l.destinationId !== d.id),
                          ...(e.target.value ? [{ destinationId: d.id, quantity: e.target.value }] : []),
                        ])
                      }
                    />
                  </label>
                );
              })}
              {split && (
                <p
                  className={`rounded-xl p-3 ${split.status === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
                >
                  {split.status === "ok"
                    ? "Répartition complète."
                    : split.remaining > 0
                      ? `Reste à affecter : ${fmt(split.remaining)} ${unitLabel(net.unitCode)}`
                      : `Trop affecté : ${fmt(-split.remaining)} ${unitLabel(net.unitCode)}`}
                </p>
              )}
              {split?.status === "ecart" && (
                <label className="flex flex-col gap-1">
                  <span className="font-medium">Justification de l&apos;écart</span>
                  <input className="field" value={justification} onChange={(e) => setJustification(e.target.value)} />
                </label>
              )}
              {commentNeeded && <OtherDestinationComment value={comment} onChange={setComment} />}
              <button
                type="button"
                className="btn-primary"
                disabled={!split || (split.status === "ecart" && !justification.trim()) || commentMissing}
                onClick={() => setStep("recap")}
              >
                Continuer
              </button>
            </div>
          )}
        </Section>
      )}

      {step === "recap" && net && (
        <Section title="Vérifier et valider">
          {correction && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
              Correction : touchez « Modifier » sur la ligne à changer, puis indiquez le motif en bas de page.
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 rounded-2xl bg-white p-4">
            <dt className="text-slate-500">Lieu</dt>
            <dd>
              {zone?.name}
              {zone && zone.subzones.length > 1 && ` › ${subzone?.name}`}
            </dd>
            <EditLink onClick={() => setStep("zone")} />
            <dt className="text-slate-500">Équipe</dt>
            <dd>
              {subzone?.teamMode === "equipe"
                ? `Équipe ${userTeam?.letter ?? team?.letter}`
                : `Responsable de zone${userTeam ? ` (saisi par l'équipe ${userTeam.letter})` : ""}`}
            </dd>
            {needsTeam ? <EditLink onClick={() => setStep("team")} /> : <span />}
            <dt className="text-slate-500">Produit</dt>
            <dd>
              {product?.name}
              {product?.kind === "free" && <span className="text-sm text-amber-700"> (hors liste)</span>}
              {product?.kind === "week" && <span className="text-sm text-slate-500"> (S{product.week.number})</span>}
            </dd>
            <EditLink onClick={() => setStep("product")} />
            <dt className="text-slate-500">Quantité</dt>
            <dd>
              {netLabel}
              {asksPackaging(packagingQuestions) && (
                <span className="block text-sm text-slate-500">
                  Emballages jetés :{" "}
                  {[...(discarded.moulds ?? []), ...(discarded.tray ? ["barquette"] : [])].join(", ") || "aucun"}
                </span>
              )}
              {useTare &&
                tarePreview?.result &&
                ` (brut ${fmt(tarePreview.result.grossKg)} kg − tare ${fmt(tarePreview.result.tareTotalKg)} kg)`}
              {!useTare && net.kg != null && net.unitCode !== "kg" && ` = ${fmt(net.kg)} kg`}
              {unitCode === "colis" && !useTare && packagingKg != null && (
                <span className="block text-sm text-slate-500">
                  {packaging ? `${packaging.label ?? "Colis"} — ${packaging.supplier}, ` : "Colis de "}
                  {fmt(packagingKg)} kg
                </span>
              )}
            </dd>
            <EditLink onClick={() => setStep("quantity")} />
            {zone && lotsAllowedIn(zone.code) && (
              <>
                <dt className="text-slate-500">Lots et DLC</dt>
                <dd>
                  {lotsSummary(lotLines, today, unitLabel(net.unitCode)) ?? (
                    <span className="text-slate-500">Non indiqués</span>
                  )}
                  {photos.length > 0 && (
                    <span className="block text-sm text-slate-500">
                      {photos.length} photo{photos.length > 1 ? "s" : ""}
                    </span>
                  )}
                </dd>
                <EditLink onClick={() => setStep("lots")} />
              </>
            )}
            {product?.kind === "week" && (
              <>
                <dt className="text-slate-500">Coût brut</dt>
                <dd>
                  {costPreview?.grossEur != null ? `≈ ${fmtEuro(costPreview.grossEur)}` : "non calculable"}
                  <span className="block text-sm text-slate-500">
                    {[
                      costPreview?.foodEur != null && `matières ${fmtEuro(costPreview.foodEur)}`,
                      costPreview?.packagingEur != null && `emballages ${fmtEuro(costPreview.packagingEur)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {` (tome Melba S${product.week.number})`}
                  </span>
                  {costPreview?.grossEur != null && recoveredTotal > 0 && (
                    <span className="block text-sm font-medium">
                      Recettes − {fmtEuro(recoveredTotal)} · coût net ≈ {fmtEuro(costPreview.grossEur - recoveredTotal)}
                    </span>
                  )}
                  {costPreview?.packagingEur != null && occurredOn !== today && (
                    <span className="block text-sm text-slate-500">
                      Emballages estimés aux prix d&apos;aujourd&apos;hui : l&apos;enregistrement prend ceux de la date
                      de la perte.
                    </span>
                  )}
                </dd>
                <span />
              </>
            )}
            {listedProduct && listedPrice && (
              <>
                <dt className="text-slate-500">Coût brut</dt>
                <dd>
                  {costPreview?.grossEur != null ? `≈ ${fmtEuro(costPreview.grossEur)}` : "non calculable"}
                  <span className="block text-sm text-slate-500">
                    {listedPrice.perKgEur != null && `${fmtEuro(listedPrice.perKgEur)} / kg aujourd'hui ; `}
                    l&apos;enregistrement prend le prix en vigueur à la date de la perte.
                  </span>
                </dd>
                <span />
              </>
            )}
            <dt className="text-slate-500">Cause</dt>
            <dd>{options.causes.find((c) => c.id === causeId)?.name}</dd>
            <EditLink onClick={() => setStep("cause")} />
            <dt className="text-slate-500">Destination</dt>
            <dd>
              {destinationLines
                .map(
                  (l) =>
                    `${options.destinations.find((d) => d.id === l.destinationId)?.name}${
                      splitMode ? ` : ${fmt(parseNumber(l.quantity) ?? 0)}` : ""
                    }`,
                )
                .join(" ; ")}
            </dd>
            <EditLink onClick={() => setStep("destination")} />
            {saleLines.map((l) => (
              <div key={l.destinationId} className="col-span-3">
                <label className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 p-3">
                  <span className="text-sm font-medium">
                    Montant encaissé – {options.destinations.find((d) => d.id === l.destinationId)?.name} (€,
                    facultatif)
                  </span>
                  <input
                    className="field w-32 text-right"
                    inputMode="decimal"
                    value={recoveredAmounts[l.destinationId] ?? ""}
                    onChange={(e) => setRecoveredAmounts((prev) => ({ ...prev, [l.destinationId]: e.target.value }))}
                    aria-label="Montant encaissé"
                  />
                </label>
              </div>
            ))}
            {binLines.map((l) => (
              <div key={`bin-${l.destinationId}`} className="col-span-3">
                {/* Bien visible pour ne pas oublier de le noter (décision du 23/11/2026). */}
                <label className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-500 bg-amber-100 p-3 shadow-sm">
                  <span className="text-base font-bold text-amber-950">
                    <span aria-hidden>🗑️ </span>
                    N° de poubelle – {options.destinations.find((d) => d.id === l.destinationId)?.name}
                    {binMode(l.destinationId) === "facultatif" && " (facultatif)"}
                    <span className="block text-sm font-medium text-amber-900">
                      Vérifiez le numéro écrit sur la poubelle ; à changer seulement si la poubelle a changé.
                    </span>
                  </span>
                  <input
                    className="field w-32 text-right"
                    value={binOf(l.destinationId)}
                    onChange={(e) => setBinNumbers((prev) => ({ ...prev, [l.destinationId]: e.target.value }))}
                    aria-label="N° de poubelle"
                    maxLength={20}
                    required={binMode(l.destinationId) === "obligatoire"}
                  />
                </label>
                {binMode(l.destinationId) === "obligatoire" && !binOf(l.destinationId).trim() && (
                  <p className="mt-1 text-sm font-semibold text-amber-900">⚠ Indiquez le n° de la poubelle.</p>
                )}
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Date de la perte</span>
              <input
                type="date"
                className="field"
                max={today}
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Heure (facultatif)</span>
              <input
                type="time"
                className="field"
                value={occurredTime}
                onChange={(e) => setOccurredTime(e.target.value)}
              />
            </label>
          </div>
          {productWeekMismatch && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
              Le produit choisi est un produit de S{product.week.number} : indiquez une date de cette semaine, ou
              changez de produit.{" "}
              <button type="button" className="font-medium underline" onClick={() => setStep("product")}>
                Changer le produit
              </button>
            </p>
          )}
          {isLate && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
              Déclaration tardive : la perte sera comptée en {formatProductionWeek(computeProductionWeek(occurredOn))}.
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-medium">
              {commentNeeded
                ? "Commentaire (obligatoire : précisez « Autre destination »)"
                : "Commentaire (facultatif)"}
            </span>
            <textarea className="field min-h-20 py-2" value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>

          {correction && (
            <label className="flex flex-col gap-1">
              <span className="font-medium">Motif de la correction (obligatoire)</span>
              <input
                className="field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="ex. erreur de pesée"
              />
            </label>
          )}
          {result && !result.ok && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
              {result.error}
            </p>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={
              pending ||
              !occurredOn ||
              productWeekMismatch ||
              missingBin ||
              commentMissing ||
              (!!correction && reason.trim().length < 3)
            }
            onClick={submit}
          >
            {pending
              ? "Enregistrement…"
              : correction
                ? "Enregistrer la correction"
                : batch
                  ? batch.editing
                    ? "Mettre à jour la ligne"
                    : "Ajouter à la liste"
                  : "Valider la perte"}
          </button>
        </Section>
      )}
    </div>
  );
}

// ─── Composants d'interface ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </section>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Tile({
  children,
  onClick,
  selected = false,
  compact = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
  compact?: boolean;
  /** Visible mais pas choisissable (zone d'un autre responsable). */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex flex-col items-start justify-center gap-0.5 rounded-2xl border-2 p-4 text-left font-semibold ${
        compact ? "min-h-14 text-lg" : "min-h-20 text-xl"
      } ${
        disabled
          ? "cursor-not-allowed border-transparent bg-slate-100 text-slate-400"
          : selected
            ? "border-brun-700 bg-creme-100"
            : "border-transparent bg-white shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

/** Proposition d'une cause manquante (§9.3), soumise à validation de l'administrateur. */
function ProposeCause({ zoneId, zoneName }: { zoneId: string; zoneName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (status?.ok) {
    return (
      <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
        {status.message}
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        className="self-start text-sm font-medium text-rouge-700 underline"
        onClick={() => setOpen(true)}
      >
        Proposer une nouvelle cause
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4">
      <p className="font-medium">Nouvelle cause pour « {zoneName} »</p>
      <input className="field" placeholder="Nom de la cause" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className="field"
        placeholder="Précision (facultatif)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {status && !status.ok && <p className="text-red-800">{status.message}</p>}
      <button
        type="button"
        className="btn-secondary"
        disabled={pending || name.trim().length < 3}
        onClick={() =>
          startTransition(async () => {
            const r = await proposeCauseAction({ name, description, zoneId });
            setStatus(
              r.ok
                ? {
                    ok: true,
                    message:
                      "Merci : proposition envoyée à l'administrateur. En attendant, choisissez « Autres causes ».",
                  }
                : { ok: false, message: r.error ?? "Proposition impossible" },
            );
          })
        }
      >
        Envoyer la proposition
      </button>
    </div>
  );
}

function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-sm font-medium text-rouge-700 underline">
      Modifier
    </button>
  );
}

function Breadcrumb({ items }: { items: (string | null | undefined)[] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return <p className="text-sm text-slate-600">{visible.join(" › ")}</p>;
}

function Stepper({
  label,
  hint,
  value,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-2 pl-3">
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Retirer un ${label}`}
          className="size-12 rounded-xl bg-slate-100 text-2xl"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <span className="w-8 text-center text-xl font-semibold" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Ajouter un ${label}`}
          className="size-12 rounded-xl bg-slate-100 text-2xl"
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </span>
    </div>
  );
}

/** Produits proposés : ceux de la semaine (plats → sous-recettes → ingrédients), puis le référentiel. */
/** Zones où les matières de la semaine sont proposées d'abord (étape 6.10). */
const MATERIAL_ZONE_CODES = ["RECEPTION", "STOCKAGE"];

function ProductStep({
  products,
  catalogs,
  weekMaterials,
  packagings,
  suppliers,
  supplierList,
  materialCategories,
  zoneCode,
  materialPlace,
  initialWeek,
  initialCatalog,
  packagingPerPortion,
  dishScope,
  showSnacks,
  onlySnacks,
  subzoneCode,
  teamId,
  onChoose,
}: {
  products: DeclarationOptions["products"];
  /** Semaines importées proposées (en cours et précédente). */
  catalogs: WeekCatalog[];
  /** Matières de la semaine (tome et bons de commande), en cours et précédente. */
  weekMaterials: DeclarationOptions["weekMaterials"];
  /** Colis fournisseur par produit : fournisseur et colis affichés sous chaque matière. */
  packagings: DeclarationOptions["packagings"];
  suppliers: DeclarationOptions["suppliers"];
  /** Fournisseurs proposés pour un article saisi à la main. */
  supplierList: DeclarationOptions["supplierList"];
  materialCategories: DeclarationOptions["materialCategories"];
  /** Zone de la perte : types proposés pour un produit absent de la liste. */
  zoneCode: string;
  /** Réception ou Stockage : matières de la semaine d'abord, filtrées par sous-zone en Stockage. */
  materialPlace: { zoneCode: string; subzoneId: string; subzoneName: string } | null;
  /** Semaine de la date de la perte. */
  initialWeek: { year: number; number: number } | null;
  /** Semaine de la date de la perte, si elle est importée. */
  initialCatalog: WeekCatalog | null;
  /** Emballages du référentiel par portion (aperçu du coût). */
  packagingPerPortion: Record<"plat" | "petit_dejeuner", number>;
  /** Plats proposés : ceux de l'équipe (poste de cuisine), tous (conditionnement, décision du 10/11/2026) ou aucun. */
  dishScope: "equipe" | "toutes" | null;
  /** Conditionnement, réception, stockage : encas (règle R9). */
  showSnacks: boolean;
  /** Salle des cartons, poste des encas : rien d'autre que des encas (décision du 25/11/2026). */
  onlySnacks?: boolean;
  /** Lieu choisi : au Stockage, les encas frais au local frais, les autres au stockage sec (décision du 23/11/2026). */
  subzoneCode: string | null;
  /** Équipe choisie par un responsable ; pour un compte équipe, le catalogue ne contient déjà que ses plats. */
  teamId: string | null;
  onChoose: (p: ProductChoice) => void;
}) {
  const [search, setSearch] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const [freeName, setFreeName] = useState("");
  const [freeCategory, setFreeCategory] = useState<(typeof PRODUCT_CATEGORIES)[number] | null>(null);
  const [freePriceText, setFreePriceText] = useState("");
  const [freePricePer, setFreePricePer] = useState<FreePrice["per"]>("kg");
  /** Fournisseur : « » inconnu, un identifiant, ou « autre » (nom tapé). */
  const [freeSupplier, setFreeSupplier] = useState("");
  const [freeSupplierName, setFreeSupplierName] = useState("");
  const toCatalog = CATALOG_ENTRY_ZONE_CODES.includes(zoneCode);
  const supplierInvalid = toCatalog && freeSupplier === "autre" && freeSupplierName.trim().length < 2;
  const freeCategories = freeCategoriesFor(zoneCode, PRODUCT_CATEGORIES).filter(
    (c) => !onlySnacks || c === "produit_externe",
  );
  const freePriceValue = Number(freePriceText.replace(",", ".").trim());
  const freePriceInvalid = freePriceText.trim() !== "" && !(freePriceValue > 0);
  /** Chemin parcouru : un plat, puis des sous-recettes. */
  const [path, setPath] = useState<{ kind: "plat" | "sous_recette"; id: string }[]>([]);
  const [catalogId, setCatalogId] = useState(initialCatalog?.weekId ?? catalogs[0]?.weekId ?? null);
  const catalog = catalogs.find((c) => c.weekId === catalogId) ?? null;
  // Fournisseur et colis sous chaque matière : le colis pesé s'il est connu, sinon le fournisseur seul (vrac au kg, ou
  // poids du colis à compléter sur la fiche produit).
  const supplierOf = (productId: string) => {
    const k = packagings[productId]?.[0];
    if (k)
      return `${k.supplier} · ${k.label ?? "colis"} (${k.kg.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg)`;
    const s = suppliers[productId];
    if (!s) return null;
    return s.looseByKg ? `${s.supplier} · vendu au kg` : `${s.supplier} · ${s.label ?? "colis"} (poids à compléter)`;
  };
  // S+1 seulement en Réception (les bons de la semaine suivante arrivent dès le jeudi) ; S-1 et S partout.
  const shownWeeks = weekMaterials.filter((w) => w.relative !== 1 || materialPlace?.zoneCode === "RECEPTION");
  const initialMaterialsWeek =
    shownWeeks.find((w) => initialWeek && w.year === initialWeek.year && w.number === initialWeek.number) ?? null;
  const [materialsWeekId, setMaterialsWeekId] = useState(
    initialMaterialsWeek?.weekId ?? shownWeeks.find((w) => w.relative === 0)?.weekId ?? shownWeeks[0]?.weekId ?? null,
  );
  const materialsWeek = materialPlace ? (shownWeeks.find((w) => w.weekId === materialsWeekId) ?? null) : null;
  const placed =
    materialsWeek && materialPlace
      ? materialsForPlace(
          materialsWeek.materials,
          new Map(materialCategories.map((c) => [c.id, c.storageSubzoneId])),
          materialPlace,
        )
      : null;
  const categoryName = (id: string | null) => (id ? (materialCategories.find((c) => c.id === id)?.name ?? null) : null);
  const chooseMaterial = (m: { productId: string; name: string }) => {
    const p = products.find((x) => x.id === m.productId);
    onChoose({ kind: "listed", id: m.productId, name: m.name, category: p?.category ?? "matiere_premiere" });
  };
  const pickWeek = (weekId: string) => {
    setMaterialsWeekId(weekId);
    if (catalogs.some((c) => c.weekId === weekId)) setCatalogId(weekId);
  };

  const week = catalog ? { year: catalog.year, number: catalog.number } : null;
  const dishes = (catalog?.dishes ?? []).filter((d) =>
    d.snack ? showSnacks : dishScope === "toutes" || (dishScope === "equipe" && (!teamId || d.teamId === teamId)),
  );
  const hasWeek = dishes.length > 0;

  const chooseDish = (d: WeekCatalog["dishes"][number]) =>
    onChoose({
      kind: "week",
      itemKind: "plat",
      id: d.id,
      name: productLabel(d.name, d.code),
      category: d.snack ? "produit_externe" : "produit_fini",
      unitWeightKg: gramsToKg(d.portionWeightG),
      week: week!,
      cost: { food: d.cost, packagingPerPortionEur: null, portionWeightKg: gramsToKg(d.portionWeightG) },
      dishPackaging: d.portionKind
        ? { moulds: d.moulds, trayPerPortionEur: packagingPerPortion[d.portionKind] }
        : undefined,
    });
  const chooseSubRecipe = (id: string) =>
    onChoose({
      kind: "week",
      itemKind: "sous_recette",
      id,
      name: catalog!.subRecipes[id]!.name,
      category: catalog!.subRecipes[id]!.mould ? "moule_plat_gratin" : "sous_recette",
      unitWeightKg: null,
      week: week!,
      cost: itemCostInputs(catalog!.subRecipes[id]!.cost, catalog!.subRecipes[id]!.mould),
    });
  const chooseIngredient = (l: WeekCatalog["dishes"][number]["lines"][number]) =>
    onChoose({
      kind: "week",
      itemKind: "ingredient",
      id: l.id,
      name: l.label,
      category: l.mould ? "moule_plat_gratin" : "matiere_premiere",
      unitWeightKg: gramsToKg(l.unitWeightG),
      densityKgPerL: l.densityKgPerL,
      week: week!,
      cost: itemCostInputs(l.cost, l.mould),
    });

  if (freeMode) {
    return (
      <Section title="Quel produit ?">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Nom du produit</span>
          <input className="field" value={freeName} onChange={(e) => setFreeName(e.target.value)} autoFocus />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">Type de produit</legend>
          <TileGrid>
            {freeCategories.map((c) => (
              <Tile key={c} compact selected={freeCategory === c} onClick={() => setFreeCategory(c)}>
                {PRODUCT_CATEGORY_LABELS[c]}
              </Tile>
            ))}
          </TileGrid>
        </fieldset>
        <div className="flex flex-col gap-1">
          <span className="font-medium">Prix d&apos;achat HT (facultatif)</span>
          <span className="flex gap-2">
            <input
              className="field w-32"
              inputMode="decimal"
              aria-label="Prix d'achat HT"
              placeholder="ex. 3,50"
              value={freePriceText}
              onChange={(e) => setFreePriceText(e.target.value)}
            />
            <select
              className="field"
              aria-label="Prix par"
              value={freePricePer}
              onChange={(e) => setFreePricePer(e.target.value as FreePrice["per"])}
            >
              <option value="kg">€ / kg</option>
              <option value="piece">€ / pièce</option>
            </select>
          </span>
          <span className="text-sm text-slate-500">
            {freePriceInvalid
              ? "Prix invalide."
              : "Pour chiffrer la perte. Sinon, l'administration pourra l'indiquer plus tard."}
          </span>
        </div>
        {toCatalog && (
          <>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Fournisseur (facultatif)</span>
              <select className="field" value={freeSupplier} onChange={(e) => setFreeSupplier(e.target.value)}>
                <option value="">Je ne sais pas</option>
                {supplierList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="autre">Autre fournisseur (le taper)…</option>
              </select>
            </label>
            {freeSupplier === "autre" && (
              <label className="flex flex-col gap-1">
                <span className="font-medium">Nom du fournisseur</span>
                <input
                  className="field"
                  value={freeSupplierName}
                  onChange={(e) => setFreeSupplierName(e.target.value)}
                  placeholder="ex. Pro à Pro"
                />
              </label>
            )}
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
              Cet article sera ajouté à la liste des articles, marqué « saisi à la main », et devra être validé par
              l&apos;administration.
            </p>
          </>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={freeName.trim().length < 2 || !freeCategory || freePriceInvalid || supplierInvalid}
          onClick={() =>
            onChoose({
              kind: "free",
              name: freeName.trim(),
              category: freeCategory!,
              price: freePriceText.trim() ? { amountEur: freePriceValue, per: freePricePer } : null,
              supplier: !toCatalog
                ? null
                : freeSupplier === "autre"
                  ? { supplierName: freeSupplierName.trim() }
                  : freeSupplier
                    ? { supplierId: freeSupplier }
                    : null,
            })
          }
        >
          Continuer
        </button>
        <button type="button" className="text-slate-600 underline" onClick={() => setFreeMode(false)}>
          Revenir à la liste
        </button>
      </Section>
    );
  }

  // ─── Parcours plat → sous-recette → ingrédient ──────────────────────────
  const current = path.at(-1);
  if (catalog && current) {
    const dish = current.kind === "plat" ? dishes.find((d) => d.id === current.id) : undefined;
    const sub = current.kind === "sous_recette" ? catalog.subRecipes[current.id] : undefined;
    const lines = dish?.lines ?? sub?.lines ?? [];
    return (
      <Section title={dish ? productLabel(dish.name, dish.code) : (sub?.name ?? "")}>
        <button
          type="button"
          className="self-start text-slate-700 underline"
          onClick={() => setPath(path.slice(0, -1))}
        >
          {path.length > 1 ? "← Revenir au niveau précédent" : "← Tous les plats"}
        </button>
        <Tile onClick={() => (dish ? chooseDish(dish) : chooseSubRecipe(current.id))}>
          {dish ? (dish.snack ? "L'encas entier" : "Le plat entier (barquettes)") : "La sous-recette entière"}
          <small className="font-normal opacity-80">{dish ? "Produit fini" : "Sous-recette"}</small>
        </Tile>
        {lines.length > 0 && <p className="font-medium text-slate-700">Ou seulement un composant :</p>}
        <div className="flex flex-col gap-2">
          {lines.map((l) =>
            l.subRecipeId && catalog.subRecipes[l.subRecipeId] ? (
              <Tile key={l.id} compact onClick={() => setPath([...path, { kind: "sous_recette", id: l.subRecipeId! }])}>
                {l.label} →<small className="font-normal opacity-70">Sous-recette : voir ses ingrédients</small>
              </Tile>
            ) : (
              <Tile key={l.id} compact onClick={() => chooseIngredient(l)}>
                {l.label}
                <small className="font-normal opacity-70">{l.mould ? "Moule ou plat à gratin" : "Ingrédient"}</small>
              </Tile>
            ),
          )}
        </div>
      </Section>
    );
  }

  // ─── Accueil de l'étape : produits de la semaine, recherche, hors liste ───
  const term = search.trim().toLowerCase();
  // Encas (règle R9) : seulement en conditionnement, réception et stockage ; au Stockage, là où ils sont rangés.
  const snackHere = (p: (typeof products)[number]) =>
    showSnacks && snackAllowedIn(zoneCode, subzoneCode, p.snackFamily);
  const offered = products.filter((p) => (p.category === "produit_externe" ? snackHere(p) : !onlySnacks));
  const listedMatches = term
    ? offered.filter((p) => [p.name, p.code, p.externalId].some((v) => v?.toLowerCase().includes(term)))
    : [];
  const snacksHere = products.filter((p) => p.category === "produit_externe" && snackHere(p));
  const snackList = snacksHere.length ? (
    <SnackList
      snacks={snacksHere}
      supplierOf={supplierOf}
      onChoose={(p) => onChoose({ kind: "listed", id: p.id, name: p.name, category: p.category })}
    />
  ) : null;
  const weekMatches = term.length >= 2 && catalog ? searchWeek(catalog, dishes, term) : [];

  return (
    <Section title="Quel produit ?">
      <input
        className="field"
        type="search"
        placeholder={hasWeek ? "Rechercher un plat, une sous-recette, un ingrédient" : "Rechercher par nom ou code"}
        aria-label="Rechercher un produit"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button
        type="button"
        className="self-start font-medium text-rouge-700 underline"
        onClick={() => setFreeMode(true)}
      >
        Produit absent de la liste
      </button>
      {term ? (
        <div className="flex flex-col gap-2">
          {weekMatches.map((m) => (
            <Tile
              key={`${m.kind}:${m.id}`}
              compact
              onClick={() =>
                m.kind === "plat"
                  ? chooseDish(m.dish!)
                  : m.kind === "sous_recette"
                    ? chooseSubRecipe(m.id)
                    : chooseIngredient(m.line!)
              }
            >
              {m.label}
              <small className="font-normal opacity-70">
                {m.kind === "plat"
                  ? "Plat de la semaine"
                  : m.kind === "sous_recette"
                    ? "Sous-recette de la semaine"
                    : "Ingrédient de la semaine"}
              </small>
            </Tile>
          ))}
          {listedMatches.slice(0, 20).map((p) => (
            <Tile
              key={p.id}
              compact
              onClick={() => onChoose({ kind: "listed", id: p.id, name: p.name, category: p.category })}
            >
              {p.name}
              {p.variant && ` – ${p.variant}`}
              <small className="font-normal opacity-70">
                {PRODUCT_CATEGORY_LABELS[p.category]}
                {p.code && ` · ${p.code}`}
                {p.toValidate && " · saisi à la main, à valider"}
              </small>
            </Tile>
          ))}
          {weekMatches.length === 0 && listedMatches.length === 0 && (
            <p className="text-slate-500">Aucun produit trouvé.</p>
          )}
        </div>
      ) : placed && materialsWeek ? (
        <>
          {(shownWeeks.length > 1 || materialsWeek !== initialMaterialsWeek) && (
            <nav aria-label="Semaine" className="flex flex-wrap gap-2">
              {shownWeeks.map((w) => (
                <button
                  key={w.weekId}
                  type="button"
                  onClick={() => pickWeek(w.weekId)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${w.weekId === materialsWeek.weekId ? "bg-brun-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
                >
                  S{w.number}
                  {w.relative === -1 ? " (S-1)" : w.relative === 1 ? " (S+1)" : " (cette semaine)"}
                </button>
              ))}
            </nav>
          )}
          <MaterialGroups
            title={
              materialPlace!.zoneCode === "STOCKAGE"
                ? `Matières de la semaine S${materialsWeek.number} rangées ici`
                : `Matières de la semaine S${materialsWeek.number}`
            }
            materials={placed.here}
            categoryName={categoryName}
            supplierOf={supplierOf}
            onChoose={chooseMaterial}
            empty={
              materialPlace!.zoneCode === "STOCKAGE"
                ? "Aucune catégorie de matière n'est encore rangée dans ce lieu (Administration → Lieux de stockage des matières)."
                : "Aucune matière pour cette semaine : le tome ou les bons de commande ne sont pas encore importés."
            }
          />
          {placed.unplaced.length > 0 && (
            <details className="rounded-xl bg-white p-3 shadow-sm">
              <summary className="cursor-pointer font-medium text-slate-700">
                Matières de la semaine sans lieu de stockage réglé ({placed.unplaced.length})
              </summary>
              <div className="mt-2">
                <MaterialGroups
                  materials={placed.unplaced}
                  categoryName={categoryName}
                  supplierOf={supplierOf}
                  onChoose={chooseMaterial}
                />
              </div>
            </details>
          )}
          {dishes.length > 0 && catalog?.weekId === materialsWeek.weekId && (
            <>
              <p className="font-medium text-slate-700">Encas de la semaine S{catalog.number}</p>
              <div className="flex flex-col gap-2">
                {dishes.map((d) => (
                  <Tile key={d.id} compact onClick={() => setPath([{ kind: "plat", id: d.id }])}>
                    <span>{productLabel(d.name, d.code)}</span>
                    <small className="font-normal opacity-70">
                      {d.lines.length} composant{d.lines.length > 1 ? "s" : ""} →
                    </small>
                  </Tile>
                ))}
              </div>
            </>
          )}
          {snackList}
          <p className="text-sm text-slate-600">Une autre matière : recherchez-la par son nom.</p>
        </>
      ) : hasWeek ? (
        <>
          {(catalogs.length > 1 || catalog !== initialCatalog) && (
            <nav aria-label="Semaine" className="flex flex-wrap gap-2">
              {catalogs.map((c) => (
                <button
                  key={c.weekId}
                  type="button"
                  onClick={() => setCatalogId(c.weekId)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${c.weekId === catalogId ? "bg-brun-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
                >
                  S{c.number}
                  {c === initialCatalog ? " (cette semaine)" : ""}
                </button>
              ))}
            </nav>
          )}
          {catalog !== initialCatalog && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
              Produits de S{catalog!.number} : la date de la perte devra être dans cette semaine.
            </p>
          )}
          <p className="font-medium text-slate-700">
            {showSnacks && !dishScope ? "Encas" : showSnacks ? "Plats et encas" : "Plats"} de la semaine S
            {catalog!.number}
          </p>
          <div className="flex flex-col gap-2">
            {dishes.map((d) => (
              <Tile key={d.id} compact onClick={() => setPath([{ kind: "plat", id: d.id }])}>
                <span>{productLabel(d.name, d.code)}</span>
                <small className="font-normal opacity-70">
                  {d.lines.length} composant{d.lines.length > 1 ? "s" : ""} →
                </small>
              </Tile>
            ))}
          </div>
          {snackList}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {snackList}
          {(onlySnacks ? [] : offered.slice(0, 30)).map((p) => (
            <Tile
              key={p.id}
              compact
              onClick={() => onChoose({ kind: "listed", id: p.id, name: p.name, category: p.category })}
            >
              {p.name}
              {p.variant && ` – ${p.variant}`}
              <small className="font-normal opacity-70">
                {PRODUCT_CATEGORY_LABELS[p.category]}
                {p.code && ` · ${p.code}`}
                {p.toValidate && " · saisi à la main, à valider"}
              </small>
            </Tile>
          ))}
          {offered.length === 0 && (
            <p className="text-slate-500">
              {dishScope && !catalog ? "Les plats de la semaine ne sont pas encore importés : " : ""}recherchez le
              produit ou saisissez son nom.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/**
 * Tous les encas, quelle que soit la semaine (décision du 20/11/2026) : ils restent longtemps en stock. Rangés par
 * famille, chaque famille repliée.
 */
function SnackList({
  snacks,
  supplierOf,
  onChoose,
}: {
  snacks: DeclarationOptions["products"];
  supplierOf: (productId: string) => string | null;
  onChoose: (p: DeclarationOptions["products"][number]) => void;
}) {
  if (!snacks.length) return null;
  const families = new Map<string, typeof snacks>();
  for (const p of snacks) {
    const f = p.snackFamily ?? "";
    families.set(f, [...(families.get(f) ?? []), p]);
  }
  const ordered = [...families].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "fr")));
  const grams = (kg: number | null) =>
    kg == null ? null : `${(kg * 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} g`;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-slate-700">Tous les encas ({snacks.length})</p>
      {ordered.map(([family, list]) => (
        <details key={family || "-"} className="rounded-xl bg-white p-3 shadow-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            {family || "Autres encas"} ({list.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {list.map((p) => (
              <Tile key={p.id} compact onClick={() => onChoose(p)}>
                {p.name}
                {(supplierOf(p.id) ?? grams(p.unitWeightKg)) && (
                  <small className="font-normal text-slate-500">{supplierOf(p.id) ?? grams(p.unitWeightKg)}</small>
                )}
              </Tile>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/** Matières regroupées par catégorie Melba (les matières sans catégorie à la fin). */
function MaterialGroups({
  title,
  materials,
  categoryName,
  onChoose,
  empty,
  supplierOf,
}: {
  title?: string;
  materials: DeclarationOptions["weekMaterials"][number]["materials"];
  categoryName: (id: string | null) => string | null;
  onChoose: (m: { productId: string; name: string }) => void;
  empty?: string;
  /** Fournisseur et colis d'une matière (« Pro à Pro · Sachet 5kg »), ou null. */
  supplierOf?: (productId: string) => string | null;
}) {
  const groups = new Map<string, typeof materials>();
  for (const m of materials) {
    const name = categoryName(m.categoryId) ?? "";
    groups.set(name, [...(groups.get(name) ?? []), m]);
  }
  const ordered = [...groups].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "fr")));
  return (
    <div className="flex flex-col gap-3">
      {title && <p className="font-medium text-slate-700">{title}</p>}
      {materials.length === 0 && empty && <p className="text-slate-500">{empty}</p>}
      {ordered.map(([name, list]) => (
        <div key={name || "-"} className="flex flex-col gap-2">
          {ordered.length > 1 && (
            <p className="text-sm font-semibold text-slate-600">{name || "Sans catégorie Melba"}</p>
          )}
          {list.map((m) => (
            <Tile key={m.productId} compact onClick={() => onChoose(m)}>
              {m.name}
              {m.inTome && <small className="font-normal opacity-70">Ingrédient du tome</small>}
              {supplierOf?.(m.productId) && (
                <small className="font-normal text-slate-500">{supplierOf(m.productId)}</small>
              )}
            </Tile>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Coûts d'une sous-recette ou d'un ingrédient : matières, ou emballage s'il s'agit d'un moule. */
function itemCostInputs(cost: UnitCost, mould: boolean): CostInputs {
  return mould
    ? {
        food: { perKgEur: null, perUnitEur: null },
        packagingPerPortionEur: null,
        portionWeightKg: null,
        packagingItself: cost,
      }
    : { food: cost, packagingPerPortionEur: null, portionWeightKg: null };
}

interface WeekMatch {
  kind: WeekItemKind;
  id: string;
  label: string;
  dish?: WeekCatalog["dishes"][number];
  line?: WeekCatalog["dishes"][number]["lines"][number];
}

/** Recherche dans les produits de la semaine proposés au poste (un ingrédient présent plusieurs fois n'apparaît qu'une fois). */
function searchWeek(catalog: WeekCatalog, dishes: WeekCatalog["dishes"], term: string): WeekMatch[] {
  const fold = (t: string) =>
    t
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const wanted = fold(term);
  const matches: WeekMatch[] = [];
  for (const d of dishes)
    if (fold(`${d.code} ${d.name}`).includes(wanted))
      matches.push({ kind: "plat", id: d.id, label: productLabel(d.name, d.code), dish: d });
  // Sous-recettes et ingrédients accessibles depuis les plats proposés.
  const seenSubs = new Set<string>();
  const seenIngredients = new Set<string>();
  const visit = (lines: WeekCatalog["dishes"][number]["lines"]) => {
    for (const l of lines) {
      if (l.subRecipeId) {
        const sub = catalog.subRecipes[l.subRecipeId];
        if (!sub || seenSubs.has(sub.id)) continue;
        seenSubs.add(sub.id);
        if (fold(sub.name).includes(wanted)) matches.push({ kind: "sous_recette", id: sub.id, label: sub.name });
        visit(sub.lines);
      } else if (!seenIngredients.has(fold(l.label)) && fold(l.label).includes(wanted)) {
        seenIngredients.add(fold(l.label));
        matches.push({ kind: "ingredient", id: l.id, label: l.label, line: l });
      }
    }
  };
  for (const d of dishes) visit(d.lines);
  return matches.slice(0, 30);
}

/** Commentaire demandé quand la perte part vers « Autre destination » (décision du 19/11/2026). */
function OtherDestinationComment({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium">Précisez « Autre destination » (commentaire obligatoire)</span>
      <textarea
        className="field min-h-24 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
        placeholder="Où part la perte"
      />
    </label>
  );
}

/** Question oui / non posée en grandes tuiles (aucune réponse par défaut). */
function YesNo({
  legend,
  hint,
  value,
  onChange,
}: {
  legend: string;
  hint?: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">{legend}</legend>
      {hint && <p className="-mt-1 text-sm text-slate-500">{hint}</p>}
      <TileGrid>
        <Tile compact selected={value === true} onClick={() => onChange(true)}>
          Oui
        </Tile>
        <Tile compact selected={value === false} onClick={() => onChange(false)}>
          Non
        </Tile>
      </TileGrid>
    </fieldset>
  );
}

/**
 * Emballages et consommables jetés avec un plat entier (salle blanche, salle des cartons ; R42) : moules et plats à
 * gratin du tome, puis la barquette, avec le total par portion.
 */
function PackagingStep({
  questions,
  answers,
  trayPerPortionEur,
  onChange,
}: {
  questions: PackagingQuestions;
  answers: DiscardedPackaging;
  trayPerPortionEur: number | null;
  onChange: (a: DiscardedPackaging) => void;
}) {
  const chosen = answers.moulds ?? null;
  const toggle = (label: string) => {
    const set = new Set(chosen ?? []);
    if (set.has(label)) set.delete(label);
    else set.add(label);
    onChange({ ...answers, moulds: [...set] });
  };
  const perPortion = discardedPackagingPerPortion(questions, answers, trayPerPortionEur) ?? 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-sm">
      <p className="font-semibold">Emballages et consommables jetés avec la recette</p>
      {questions.moulds.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">
            Moule ou plat à gratin prévu par le tome Melba pour cette recette : jeté avec ?
          </legend>
          <TileGrid>
            {questions.moulds.map((m) => (
              <Tile key={m.label} compact selected={!!chosen?.includes(m.label)} onClick={() => toggle(m.label)}>
                {m.label}
                <small className="font-normal opacity-80">{fmtEuro(m.eur)} par portion</small>
              </Tile>
            ))}
            <Tile compact selected={chosen?.length === 0} onClick={() => onChange({ ...answers, moulds: [] })}>
              Aucun moule jeté
            </Tile>
          </TileGrid>
        </fieldset>
      )}
      {questions.tray && (
        <YesNo
          legend="Était-elle en barquette (barquette filmée avec étiquette) ?"
          hint={
            trayPerPortionEur
              ? `Barquette, film et étiquette : ${fmtEuro(trayPerPortionEur)} par portion`
              : "Coût de la barquette pas encore renseigné (Administration → Emballages et consommables)"
          }
          value={answers.tray ?? null}
          onChange={(v) => onChange({ ...answers, tray: v })}
        />
      )}
      <p className="text-sm text-slate-600">
        Emballages par portion : <strong>{fmtEuro(perPortion)}</strong>
      </p>
    </div>
  );
}
