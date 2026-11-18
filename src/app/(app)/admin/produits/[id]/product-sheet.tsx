"use client";

import { useActionState, useState } from "react";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { type ProductActionState, type ProductSheetState, productAction, productSheetAction } from "../../actions";
import { ProductFields } from "../products-admin";

type Category = keyof typeof PRODUCT_CATEGORY_LABELS;

interface Props {
  today: string;
  units: { code: string; label: string }[];
  categories: { id: string; name: string; storageSubzoneId: string | null }[];
  subzones: { id: string; name: string }[];
  product: {
    id: string;
    name: string;
    category: Category;
    code: string | null;
    variant: string | null;
    defaultUnit: string;
    unitWeightKg: number | null;
    densityKgPerL: number | null;
    densityReference: string | null;
    active: boolean;
    materialCategoryId: string | null;
    storageSubzoneId: string | null;
  };
  packagings: {
    supplierId: string;
    supplier: string;
    supplierCode: string | null;
    packagingLabel: string | null;
    contentQuantity: number | null;
    contentUnit: string | null;
    lastDeliveryDate: string;
  }[];
  prices: {
    id: string;
    source: "tome" | "bon_commande" | "manuel";
    validFrom: string;
    unit: string | null;
    perKgEur: number | null;
    perUnitEur: number | null;
    order: { number: string; supplier: string } | null;
    week: { year: number; number: number } | null;
    inForce: boolean;
  }[];
}

const SOURCES = { tome: "Tome", bon_commande: "Bon de commande", manuel: "Saisi à la main" } as const;
const fmtEur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: n < 0.1 ? 4 : 2 });
const fmtNumber = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));

function Feedback({ state }: { state: { error?: string; message?: string } }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
        {state.message}
      </p>
    );
  return null;
}

export function ProductSheet({ today, units, categories, subzones, product: p, packagings, prices }: Props) {
  const [productState, productFormAction, productPending] = useActionState<ProductActionState, FormData>(productAction, {});
  const [sheetState, sheetAction, sheetPending] = useActionState<ProductSheetState, FormData>(productSheetAction, {});
  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState(p.materialCategoryId ?? "");
  const category = categories.find((c) => c.id === categoryId);
  const categoryPlace = subzones.find((z) => z.id === category?.storageSubzoneId)?.name ?? null;
  const unitLabel = units.find((u) => u.code === p.defaultUnit)?.label ?? p.defaultUnit;

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Produit ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Produit</h2>
        <Feedback state={productState} />
        {editing ? (
          <form action={productFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="productId" value={p.id} />
            <ProductFields units={units} defaults={p} />
            <div className="flex gap-2">
              <button type="submit" disabled={productPending} className="btn-primary flex-1">
                Enregistrer
              </button>
              <button type="button" className="px-4 text-slate-700" onClick={() => setEditing(false)}>
                Fermer
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              {p.code && `Code ${p.code} · `}Unité {unitLabel}
              {p.unitWeightKg != null && ` · ${fmtNumber(p.unitWeightKg)} kg par unité`}
              {p.densityKgPerL != null && ` · densité ${fmtNumber(p.densityKgPerL)} kg/L${p.densityReference ? ` (référence : ${p.densityReference})` : ""}`}
            </p>
            <p className="text-sm text-slate-500">
              Le nom, l&apos;unité, le poids et la densité ne sont jamais changés par un import ; les pertes passées gardent ce qui a été
              enregistré à l&apos;époque.
            </p>
            <form action={productFormAction} className="flex gap-4">
              <input type="hidden" name="productId" value={p.id} />
              <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(true)}>
                Modifier
              </button>
              <button type="submit" name="intent" value={p.active ? "deactivate" : "activate"} className={`text-sm font-medium underline ${p.active ? "text-red-800" : "text-teal-800"}`}>
                {p.active ? "Désactiver" : "Réactiver"}
              </button>
            </form>
          </>
        )}
      </section>

      <Feedback state={sheetState} />

      {/* ─── Rangement ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Catégorie et lieu de stockage</h2>
        <p className="text-sm text-slate-600">
          En Stockage, la saisie propose d&apos;abord les matières de la semaine rangées dans le lieu choisi : le lieu propre au produit s&apos;il
          en a un, sinon celui de sa catégorie Melba.
        </p>
        <form action={sheetAction} className="flex flex-col gap-2">
          <input type="hidden" name="intent" value="placement" />
          <input type="hidden" name="productId" value={p.id} />
          <label className="flex flex-col gap-1">
            <span className="font-medium">Catégorie Melba</span>
            <select name="materialCategoryId" className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Aucune —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Lieu de stockage</span>
            <select name="storageSubzoneId" className="field" defaultValue={p.storageSubzoneId ?? ""}>
              <option value="">{category ? `Celui de la catégorie (${categoryPlace ?? "pas de lieu réglé"})` : "Celui de la catégorie (aucune catégorie)"}</option>
              {subzones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={sheetPending} className="btn-secondary self-start">
            Enregistrer
          </button>
        </form>
      </section>

      {/* ─── Colis fournisseurs ──────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Colis fournisseurs</h2>
        {packagings.length === 0 ? (
          <p className="text-sm text-slate-600">Jamais commandé dans un bon déposé.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {packagings.map((k) => (
              <li key={k.supplierId} className="flex flex-col py-2">
                <span className="font-medium">{k.supplier}</span>
                <span className="text-sm text-slate-600">
                  {k.packagingLabel ?? "Colis non précisé"}
                  {k.supplierCode && ` · code ${k.supplierCode}`} · dernier bon livré le {fmtDay(k.lastDeliveryDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-slate-500">Lus dans les bons de commande : le dernier colis commandé chez chaque fournisseur.</p>
      </section>

      {/* ─── Prix ────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Prix ({prices.length} version{prices.length > 1 ? "s" : ""})</h2>
        <p className="text-sm text-slate-600">
          Une perte prend le prix en vigueur à sa date : le dernier prix d&apos;achat ou saisi à la main, à défaut le coût du tome. Chaque
          changement est une nouvelle version ; les pertes déjà enregistrées gardent leur coût.
        </p>
        {prices.length === 0 ? (
          <p className="text-sm text-amber-800">Aucun prix connu : le coût des pertes de ce produit reste vide.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {prices.map((v) => (
              <li key={v.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {[v.perKgEur != null && `${fmtEur(v.perKgEur)} / kg`, v.perUnitEur != null && `${fmtEur(v.perUnitEur)} / ${v.unit ?? "unité"}`].filter(Boolean).join(" · ")}
                    {v.inForce && <span className="ml-2 rounded-full bg-teal-100 px-2 text-sm font-normal text-teal-900">En vigueur</span>}
                  </span>
                  <span className="text-sm text-slate-600">
                    Depuis le {fmtDay(v.validFrom)} · {SOURCES[v.source]}
                    {v.week && ` S${v.week.number}`}
                    {v.order && ` n° ${v.order.number}, ${v.order.supplier}`}
                  </span>
                </div>
                {v.source === "manuel" && (
                  <form action={sheetAction}>
                    <input type="hidden" name="intent" value="remove_price" />
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="priceId" value={v.id} />
                    <button type="submit" disabled={sheetPending} className="text-sm font-medium text-red-800 underline">
                      Retirer
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={sheetAction} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="intent" value="add_price" />
          <input type="hidden" name="productId" value={p.id} />
          <h3 className="font-semibold">Saisir un prix</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium">À partir du</span>
              <input type="date" name="validFrom" className="field" defaultValue={today} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Prix au kg (€ HT)</span>
              <input name="perKgEur" inputMode="decimal" className="field" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Prix à l&apos;unité (€ HT)</span>
              <input name="perUnitEur" inputMode="decimal" className="field" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Unité (si prix à l&apos;unité)</span>
              <input name="unit" className="field" placeholder="ex. pièce, pot, sachet" />
            </label>
          </div>
          <button type="submit" disabled={sheetPending} className="btn-secondary self-start">
            Enregistrer le prix
          </button>
        </form>
      </section>
    </div>
  );
}
