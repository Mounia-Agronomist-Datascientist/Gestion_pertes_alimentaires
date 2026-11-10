"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { type CostInputs, lossCostBreakdown, type UnitCost } from "@/domain/couts";
import { checkDestinationSplit } from "@/domain/destinations";
import { computeProductionWeek, formatProductionWeek } from "@/domain/semaine-production";
import { computeNetWeight } from "@/domain/tares";
import { convertToKg, type UnitKind } from "@/domain/unites";
import {
  INPUT_METHODS,
  type InputMethod,
  isNonFoodCategory,
  METHOD_LABELS,
  METHOD_UNITS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
} from "@/modules/declarations/input";
import type { DeclarationOptions } from "@/modules/declarations/options";
import type { WeekCatalog, WeekItemKind } from "@/modules/imports/catalog";
import { gramsToKg, SNACK_ZONE_CODES } from "@/modules/imports/merge";
import { proposeCauseAction, submitCorrection, submitDeclaration, type SubmitResult } from "./actions";

type Step = "zone" | "subzone" | "team" | "product" | "quantity" | "cause" | "destination" | "recap" | "done";
export type ProductChoice =
  | { kind: "listed"; id: string; name: string; category: string }
  | { kind: "free"; name: string; category: (typeof PRODUCT_CATEGORIES)[number] }
  | {
      /** Produit de l'import de la semaine (plat, sous-recette ou ingrédient). */
      kind: "week";
      itemKind: WeekItemKind;
      id: string;
      name: string;
      category: string;
      unitWeightKg: number | null;
      /** Semaine de production de l'import (le produit n'est valable que pour une perte de cette semaine). */
      week: { year: number; number: number };
      /** Coûts du tome de la semaine (matières, emballages par portion). */
      cost: CostInputs;
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
  useTare: boolean;
  grossKg: string;
  gastroCounts: Record<string, number>;
  supportId: string | null;
  causeId: string;
  destinationLines: { destinationId: string; quantity: string }[];
  justification: string;
  occurredOn: string;
  occurredTime: string;
  comment: string;
}

/** Ligne préparée en mode « plusieurs pertes », gardée sur l'appareil jusqu'à la validation du lot. */
export interface BatchLine {
  payload: Record<string, unknown>;
  initial: WizardInitial;
  summary: { productName: string; quantityLabel: string; causeName: string; placeLabel: string; destinationLabel: string };
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
  const [useTare, setUseTare] = useState(init?.useTare ?? false);
  const [grossKg, setGrossKg] = useState(init?.grossKg ?? "");
  const [gastroCounts, setGastroCounts] = useState<Record<string, number>>(init?.gastroCounts ?? {});
  const [supportId, setSupportId] = useState<string | null>(init?.supportId ?? null);
  const [causeId, setCauseId] = useState<string | null>(init?.causeId ?? null);
  const [splitMode, setSplitMode] = useState((init?.destinationLines?.length ?? 0) > 1);
  const [destinationLines, setDestinationLines] = useState<{ destinationId: string; quantity: string }[]>(
    init?.destinationLines ?? [],
  );
  const [justification, setJustification] = useState(init?.justification ?? "");
  const [occurredOn, setOccurredOn] = useState(init?.occurredOn ?? options.today);
  const [occurredTime, setOccurredTime] = useState(init?.occurredTime ?? "");
  const [comment, setComment] = useState(init?.comment ?? "");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [lastSubzoneId, setLastSubzoneId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  // Zone la plus récemment utilisée en premier.
  const lastZoneId = options.zones.find((z) => z.subzones.some((sz) => sz.id === lastSubzoneId))?.id;
  const orderedZones = [...options.zones].sort((a, b) => Number(b.id === lastZoneId) - Number(a.id === lastZoneId));

  // ─── Calculs en direct (le serveur refait tous les contrôles) ───────────────
  const gastros = options.containers.filter((c) => c.kind === "gastro");
  const supports = options.containers.filter((c) => c.kind === "support");
  const tarePreview = useMemo(() => {
    if (!useTare) return null;
    const gross = parseNumber(grossKg);
    const lines = gastros
      .filter((g) => (gastroCounts[g.id] ?? 0) > 0)
      .map((g) => ({ containerTypeId: g.id, tareId: g.id, unitTareKg: g.unitTareKg, count: gastroCounts[g.id]!, maxCount: g.maxCount }));
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
  const net = useMemo((): { quantity: number; unitCode: string; kg: number | null; note?: string } | null => {
    if (useTare) {
      const r = tarePreview?.result;
      return r ? { quantity: r.netKg, unitCode: "kg", kg: r.netKg } : null;
    }
    const q = parseNumber(quantity);
    if (q == null || q <= 0 || !unit) return null;
    const conversion = convertToKg(
      q,
      { code: unit.code, kind: unit.kind as UnitKind, toBaseFactor: unit.toBaseFactor },
      {
        isConsumable,
        unitWeightKg: product?.kind === "week" ? product.unitWeightKg : listedProduct?.unitWeightKg,
        densityKgPerL: listedProduct?.densityKgPerL,
      },
    );
    return { quantity: q, unitCode: unit.code, kg: conversion.netKg, note: conversion.reason };
  }, [useTare, tarePreview, quantity, unit, isConsumable, listedProduct, product]);

  const unitLabel = (code: string) => options.units.find((u) => u.code === code)?.label ?? code;
  const netLabel = net ? `${fmt(net.quantity)} ${unitLabel(net.unitCode)}` : "";

  const split = useMemo(() => {
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
  }, [net, destinationLines]);

  const causes = options.causes.filter(
    (c) =>
      c.isOther ||
      (zone && c.zoneIds.includes(zone.id) && (c.subzoneIds.length === 0 || (subzone && c.subzoneIds.includes(subzone.id)))),
  );

  const isLate =
    occurredOn && occurredOn <= options.today
      ? computeProductionWeek(occurredOn).startDate < computeProductionWeek(options.today).startDate
      : false;

  // Coût matière estimé d'après le tome de la semaine (le serveur refait le calcul et le fige).
  const costPreview =
    product?.kind === "week" && net ? lossCostBreakdown({ netKg: net.kg, quantity: net.quantity, unitCode: net.unitCode }, product.cost) : null;

  // Un produit de la semaine n'est valable que pour une perte de cette semaine de production.
  const occurredWeek = occurredOn ? computeProductionWeek(occurredOn) : null;
  const productWeekMismatch =
    product?.kind === "week" && occurredWeek != null && (product.week.year !== occurredWeek.year || product.week.number !== occurredWeek.number);
  const catalogForDate = options.weekCatalogs.find((c) => occurredWeek && c.year === occurredWeek.year && c.number === occurredWeek.number) ?? null;

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
    const units = METHOD_UNITS[m];
    setUnitCode(units[0] ?? null);
  }

  function chooseSingleDestination(destinationId: string) {
    if (!net) return;
    setSplitMode(false);
    setDestinationLines([{ destinationId, quantity: String(net.quantity) }]);
    setJustification("");
    setStep("recap");
  }

  function resetForNext(keepPlace: boolean) {
    setProduct(null);
    setMethod(null);
    setQuantity("");
    setUnitCode(null);
    setUseTare(false);
    setGrossKg("");
    setGastroCounts({});
    setSupportId(null);
    setCauseId(null);
    setSplitMode(false);
    setDestinationLines([]);
    setJustification("");
    setComment("");
    setOccurredTime("");
    setResult(null);
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
            : { freeLabel: product.name, category: product.category },
      method,
      quantity: useTare ? null : net.quantity,
      unitCode: useTare ? null : unitCode,
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
        .map((l) => ({ destinationId: l.destinationId, quantity: parseNumber(l.quantity) ?? 0 }))
        .filter((l) => l.quantity > 0),
      destinationGapJustification: justification || null,
      comment: comment || null,
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
          useTare,
          grossKg,
          gastroCounts,
          supportId,
          causeId,
          destinationLines,
          justification,
          occurredOn,
          occurredTime,
          comment,
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
      const r = correction
        ? await submitCorrection({ id: correction.id, expectedRevision: correction.revision, reason, payload })
        : await submitDeclaration(payload);
      setResult(r);
      if (r.ok) setStep("done");
    });
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  if (step === "done" && result?.ok) {
    const d = result.declaration;
    const cause = options.causes.find((c) => c.id === causeId);
    return (
      <div className="flex flex-col gap-6">
        <div role="status" className="flex flex-col items-center gap-2 rounded-2xl bg-emerald-50 p-6 text-center text-emerald-900">
          <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-emerald-600 text-4xl text-white">
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
          <Link href={correction ? `/historique/${correction.id}` : "/"} className="rounded-xl px-2 py-2 font-medium text-slate-700">
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
          <TileGrid>
            {orderedZones.map((z) => (
              <Tile key={z.id} onClick={() => chooseZone(z.id)} selected={z.id === zoneId}>
                {z.name}
                {z.id === lastZoneId && <small className="font-normal opacity-80">Dernière utilisée</small>}
              </Tile>
            ))}
          </TileGrid>
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
          initialCatalog={catalogForDate}
          packagingPerPortion={options.packagingPerPortion}
          dishScope={subzone?.teamMode === "equipe" ? "equipe" : zone?.code === "CONDITIONNEMENT" ? "toutes" : null}
          showSnacks={!!zone && SNACK_ZONE_CODES.includes(zone.code)}
          teamId={teamId}
          onChoose={(p) => {
            setProduct(p);
            setMethod(null);
            setStep("quantity");
          }}
        />
      )}

      {step === "quantity" && (
        <Section title="Quelle quantité ?">
          <TileGrid>
            {INPUT_METHODS.map((m) => (
              <Tile key={m} onClick={() => chooseMethod(m)} selected={m === method} compact>
                {METHOD_LABELS[m]}
              </Tile>
            ))}
          </TileGrid>

          {method === "pesee" && !isConsumable && (
            <label className="flex items-center gap-3 rounded-xl bg-white p-3 text-lg">
              <input type="checkbox" className="size-6" checked={useTare} onChange={(e) => setUseTare(e.target.checked)} />
              Pesé dans des gastros (déduire la tare)
            </label>
          )}

          {method && !useTare && (
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
                onChange={(e) => setUnitCode(e.target.value)}
              >
                {METHOD_UNITS[method].map((code) => (
                  <option key={code} value={code}>
                    {unitLabel(code)}
                  </option>
                ))}
              </select>
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
                <input className="field" inputMode="decimal" value={grossKg} onChange={(e) => setGrossKg(e.target.value)} />
              </label>
              {tarePreview?.error && <p className="rounded-xl bg-red-50 p-3 text-red-800">{tarePreview.error}</p>}
              {tarePreview?.result && (
                <p className="rounded-xl bg-white p-3 text-lg">
                  Tare {fmt(tarePreview.result.tareTotalKg)} kg — <strong>Net {fmt(tarePreview.result.netKg)} kg</strong>
                </p>
              )}
            </div>
          )}

          {net && !useTare && (
            <p className="rounded-xl bg-white p-3">
              {net.kg != null && net.unitCode !== "kg" ? (
                <>Soit <strong>{fmt(net.kg)} kg</strong></>
              ) : (
                net.note ?? (isConsumable ? "Consommable : compté en unités, pas en kg alimentaires." : null)
              )}
            </p>
          )}

          <button
            type="button"
            className="btn-primary"
            disabled={!net}
            onClick={() => {
              // Une seule destination : elle suit la nouvelle quantité (cas d'une correction).
              if (net && destinationLines.length === 1) {
                setDestinationLines([{ destinationId: destinationLines[0]!.destinationId, quantity: String(net.quantity) }]);
              }
              goNext("quantity");
            }}
          >
            Continuer
          </button>
        </Section>
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
                  setStep("destination");
                }}
              >
                {c.name}
                {c.description && <small className="font-normal opacity-80">{c.description}</small>}
              </Tile>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            Aucune cause ne correspond ? Choisissez « Autres pertes » et expliquez en commentaire.
          </p>
          {zone && <ProposeCause zoneId={zone.id} zoneName={zone.name} />}
        </Section>
      )}

      {step === "destination" && net && (
        <Section title={`Où part la perte (${netLabel}) ?`}>
          {!splitMode ? (
            <>
              <TileGrid>
                {options.destinations.map((d) => (
                  <Tile key={d.id} compact onClick={() => chooseSingleDestination(d.id)}>
                    {d.name}
                  </Tile>
                ))}
              </TileGrid>
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
              {options.destinations.map((d) => {
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
                <p className={`rounded-xl p-3 ${split.status === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
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
              <button
                type="button"
                className="btn-primary"
                disabled={!split || (split.status === "ecart" && !justification.trim())}
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
              {useTare && tarePreview?.result && ` (brut ${fmt(tarePreview.result.grossKg)} kg − tare ${fmt(tarePreview.result.tareTotalKg)} kg)`}
              {!useTare && net.kg != null && net.unitCode !== "kg" && ` = ${fmt(net.kg)} kg`}
            </dd>
            <EditLink onClick={() => setStep("quantity")} />
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
                  {costPreview?.packagingEur != null && occurredOn !== options.today && (
                    <span className="block text-sm text-slate-500">
                      Emballages estimés aux prix d&apos;aujourd&apos;hui : l&apos;enregistrement prend ceux de la date de la perte.
                    </span>
                  )}
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
          </dl>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Date de la perte</span>
              <input
                type="date"
                className="field"
                max={options.today}
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Heure (facultatif)</span>
              <input type="time" className="field" value={occurredTime} onChange={(e) => setOccurredTime(e.target.value)} />
            </label>
          </div>
          {productWeekMismatch && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
              Le produit choisi est un produit de S{product.week.number} : indiquez une date de cette semaine, ou changez de produit.{" "}
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
            <span className="font-medium">Commentaire (facultatif)</span>
            <textarea className="field min-h-20 py-2" value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>

          {correction && (
            <label className="flex flex-col gap-1">
              <span className="font-medium">Motif de la correction (obligatoire)</span>
              <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. erreur de pesée" />
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
            disabled={pending || !occurredOn || productWeekMismatch || (!!correction && reason.trim().length < 3)}
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start justify-center gap-0.5 rounded-2xl border-2 p-4 text-left font-semibold ${
        compact ? "min-h-14 text-lg" : "min-h-20 text-xl"
      } ${selected ? "border-teal-700 bg-teal-50" : "border-transparent bg-white shadow-sm"}`}
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
      <button type="button" className="self-start text-sm font-medium text-teal-800 underline" onClick={() => setOpen(true)}>
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
                ? { ok: true, message: "Merci : proposition envoyée à l'administrateur. En attendant, choisissez « Autres pertes »." }
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
    <button type="button" onClick={onClick} className="text-sm font-medium text-teal-800 underline">
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
function ProductStep({
  products,
  catalogs,
  initialCatalog,
  packagingPerPortion,
  dishScope,
  showSnacks,
  teamId,
  onChoose,
}: {
  products: DeclarationOptions["products"];
  /** Semaines importées proposées (en cours et précédente). */
  catalogs: WeekCatalog[];
  /** Semaine de la date de la perte, si elle est importée. */
  initialCatalog: WeekCatalog | null;
  /** Emballages du référentiel par portion (aperçu du coût). */
  packagingPerPortion: Record<"plat" | "petit_dejeuner", number>;
  /** Plats proposés : ceux de l'équipe (poste de cuisine), tous (conditionnement, décision du 10/11/2026) ou aucun. */
  dishScope: "equipe" | "toutes" | null;
  /** Conditionnement, réception, stockage : encas (règle R9). */
  showSnacks: boolean;
  /** Équipe choisie par un responsable ; pour un compte équipe, le catalogue ne contient déjà que ses plats. */
  teamId: string | null;
  onChoose: (p: ProductChoice) => void;
}) {
  const [search, setSearch] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const [freeName, setFreeName] = useState("");
  const [freeCategory, setFreeCategory] = useState<(typeof PRODUCT_CATEGORIES)[number] | null>(null);
  /** Chemin parcouru : un plat, puis des sous-recettes. */
  const [path, setPath] = useState<{ kind: "plat" | "sous_recette"; id: string }[]>([]);
  const [catalogId, setCatalogId] = useState(initialCatalog?.weekId ?? catalogs[0]?.weekId ?? null);
  const catalog = catalogs.find((c) => c.weekId === catalogId) ?? null;

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
      name: d.name,
      category: d.snack ? "produit_externe" : "produit_fini",
      unitWeightKg: gramsToKg(d.portionWeightG),
      week: week!,
      cost: {
        food: d.cost,
        packagingPerPortionEur: d.portionKind ? d.mouldPerPortionEur + packagingPerPortion[d.portionKind] : null,
        portionWeightKg: gramsToKg(d.portionWeightG),
      },
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
            {PRODUCT_CATEGORIES.map((c) => (
              <Tile key={c} compact selected={freeCategory === c} onClick={() => setFreeCategory(c)}>
                {PRODUCT_CATEGORY_LABELS[c]}
              </Tile>
            ))}
          </TileGrid>
        </fieldset>
        <button
          type="button"
          className="btn-primary"
          disabled={freeName.trim().length < 2 || !freeCategory}
          onClick={() => onChoose({ kind: "free", name: freeName.trim(), category: freeCategory! })}
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
      <Section title={dish ? `${dish.code} — ${dish.name}` : (sub?.name ?? "")}>
        <button type="button" className="self-start text-slate-700 underline" onClick={() => setPath(path.slice(0, -1))}>
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
  const listedMatches = term ? products.filter((p) => [p.name, p.code, p.externalId].some((v) => v?.toLowerCase().includes(term))) : [];
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
      {term ? (
        <div className="flex flex-col gap-2">
          {weekMatches.map((m) => (
            <Tile
              key={`${m.kind}:${m.id}`}
              compact
              onClick={() =>
                m.kind === "plat" ? chooseDish(m.dish!) : m.kind === "sous_recette" ? chooseSubRecipe(m.id) : chooseIngredient(m.line!)
              }
            >
              {m.label}
              <small className="font-normal opacity-70">
                {m.kind === "plat" ? "Plat de la semaine" : m.kind === "sous_recette" ? "Sous-recette de la semaine" : "Ingrédient de la semaine"}
              </small>
            </Tile>
          ))}
          {listedMatches.slice(0, 20).map((p) => (
            <Tile key={p.id} compact onClick={() => onChoose({ kind: "listed", id: p.id, name: p.name, category: p.category })}>
              {p.name}
              {p.variant && ` – ${p.variant}`}
              <small className="font-normal opacity-70">
                {PRODUCT_CATEGORY_LABELS[p.category]}
                {p.code && ` · ${p.code}`}
              </small>
            </Tile>
          ))}
          {weekMatches.length === 0 && listedMatches.length === 0 && <p className="text-slate-500">Aucun produit trouvé.</p>}
        </div>
      ) : hasWeek ? (
        <>
          {(catalogs.length > 1 || catalog !== initialCatalog) && (
            <nav aria-label="Semaine" className="flex flex-wrap gap-2">
              {catalogs.map((c) => (
                <button
                  key={c.weekId}
                  type="button"
                  onClick={() => setCatalogId(c.weekId)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${c.weekId === catalogId ? "bg-teal-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
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
            {showSnacks && !dishScope ? "Encas" : showSnacks ? "Plats et encas" : "Plats"} de la semaine S{catalog!.number}
          </p>
          <div className="flex flex-col gap-2">
            {dishes.map((d) => (
              <Tile key={d.id} compact onClick={() => setPath([{ kind: "plat", id: d.id }])}>
                <span>
                  <span className="font-mono">{d.code}</span> {d.name}
                </span>
                <small className="font-normal opacity-70">{d.lines.length} composant{d.lines.length > 1 ? "s" : ""} →</small>
              </Tile>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {products.slice(0, 30).map((p) => (
            <Tile key={p.id} compact onClick={() => onChoose({ kind: "listed", id: p.id, name: p.name, category: p.category })}>
              {p.name}
              {p.variant && ` – ${p.variant}`}
              <small className="font-normal opacity-70">
                {PRODUCT_CATEGORY_LABELS[p.category]}
                {p.code && ` · ${p.code}`}
              </small>
            </Tile>
          ))}
          {products.length === 0 && (
            <p className="text-slate-500">
              {dishScope && !catalog ? "Les plats de la semaine ne sont pas encore importés : " : ""}recherchez le produit ou saisissez son nom.
            </p>
          )}
        </div>
      )}
      <button type="button" className="btn-secondary" onClick={() => setFreeMode(true)}>
        Produit absent de la liste
      </button>
    </Section>
  );
}

/** Coûts d'une sous-recette ou d'un ingrédient : matières, ou emballage s'il s'agit d'un moule. */
function itemCostInputs(cost: UnitCost, mould: boolean): CostInputs {
  return mould
    ? { food: { perKgEur: null, perUnitEur: null }, packagingPerPortionEur: null, portionWeightKg: null, packagingItself: cost }
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
  const fold = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const wanted = fold(term);
  const matches: WeekMatch[] = [];
  for (const d of dishes) if (fold(`${d.code} ${d.name}`).includes(wanted)) matches.push({ kind: "plat", id: d.id, label: `${d.code} — ${d.name}`, dish: d });
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
