"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { NO_FILTERS, type ProductFilters, facetCounts, filterProducts } from "@/domain/filtres-produits";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { type ProductActionState, productAction } from "../actions";
import { DeleteButton } from "./delete-button";

type Category = (typeof PRODUCT_CATEGORIES)[number];

interface Product {
  id: string;
  name: string;
  category: Category;
  code: string | null;
  variant: string | null;
  snackFamily?: string | null;
  defaultUnit: string;
  unitWeightKg: number | null;
  densityKgPerL: number | null;
  /** Origine d'une densité tirée du tableau des liquides (« huile d'olive »), null si saisie à la main. */
  densityReference?: string | null;
  source: string;
  active: boolean;
  /** Matière tirée des tomes Melba (référentiel des matières premières). */
  melba: boolean;
  materialCategoryId?: string | null;
  /** Catégorie Melba (bons de commande). */
  materialCategory?: string | null;
  /** Lieu de stockage effectif : propre au produit (own) ou celui de sa catégorie. */
  storage?: { id: string; name: string | null; own: boolean } | null;
  supplierIds?: string[];
  /** Commentaire libre de l'administration. */
  comment?: string | null;
  /** Sans historique (ni perte, ni bon de commande, ni prix des tomes) : peut être supprimé. */
  deletable?: boolean;
  price: {
    perKgEur: number | null;
    perUnitEur: number | null;
    unit: string | null;
    source: string;
    validFrom: string;
    versions: number;
  } | null;
}

const PRICE_SOURCES: Record<string, string> = {
  tome: "tome",
  bon_commande: "bon de commande",
  manuel: "saisi à la main",
};
/** Au centime ; jusqu'à 4 décimales pour un petit montant (prix d'un gramme, d'une pincée). */
const fmtEur = (n: number) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 0.1 ? 4 : 2,
  });

interface Group {
  key: string;
  label: string;
  category: Category;
  count: number;
  lastOccurredOn: string;
  priced: number;
  freePrice: { amountEur: number; per: "kg" | "piece" } | null;
}

const fmtPrice = (p: { amountEur: number; per: "kg" | "piece" }) =>
  `${p.amountEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} / ${p.per === "kg" ? "kg" : "pièce"}`;

/** Prix d'achat d'une saisie « hors liste » : montant et unité (au kg ou à la pièce). */
function PriceFields({ required = false, defaults }: { required?: boolean; defaults?: Group["freePrice"] }) {
  return (
    <span className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Prix d&apos;achat HT{required ? "" : " (facultatif)"}</span>
        <input
          name="priceAmount"
          inputMode="decimal"
          className="field w-32"
          required={required}
          defaultValue={defaults ? String(defaults.amountEur).replace(".", ",") : ""}
          placeholder="ex. 3,50"
        />
      </label>
      <select name="pricePer" className="field" defaultValue={defaults?.per ?? "kg"} aria-label="Prix par">
        <option value="kg">€ / kg</option>
        <option value="piece">€ / pièce</option>
      </select>
    </span>
  );
}

interface Props {
  products: Product[];
  groups: Group[];
  units: { code: string; label: string }[];
  materialCategories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  /** Lieux de stockage (Chambre BOF, Chambre négative…). */
  places: { id: string; name: string }[];
  /** Fournisseur choisi depuis Administration → Fournisseurs. */
  initialSupplier?: string;
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));
const fmtNumber = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });

/**
 * Liste de choix d'un filtre : seules les valeurs qui donnent au moins un produit avec les autres filtres, avec leur
 * nombre ; la valeur choisie reste affichée même si elle ne donne plus rien.
 */
function FacetSelect({
  label,
  all,
  none,
  value,
  onChange,
  options,
  counts,
}: {
  label: string;
  all: string;
  none?: { value: string; label: string };
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  counts: Map<string, number>;
}) {
  const shown = options.filter((o) => counts.get(o.id) || o.id === value);
  const noneCount = counts.get("") ?? 0;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field w-full min-w-0">
        <option value="">{all}</option>
        {none && (noneCount > 0 || value === none.value) && (
          <option value={none.value}>
            {none.label} ({noneCount})
          </option>
        )}
        {shown.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({counts.get(o.id) ?? 0})
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProductsAdmin({
  products,
  groups,
  units,
  materialCategories,
  suppliers,
  places,
  initialSupplier,
}: Props) {
  const [state, action, pending] = useActionState<ProductActionState, FormData>(productAction, {});
  const [filters, setFilters] = useState<ProductFilters>({ ...NO_FILTERS, supplier: initialSupplier ?? "" });
  const setFilter = (key: keyof ProductFilters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);

  const active = products.filter((p) => p.active);
  const filterable = products.map((p) => ({
    ...p,
    materialCategoryId: p.materialCategoryId ?? null,
    supplierIds: p.supplierIds ?? [],
    storageId: p.storage?.id ?? null,
  }));
  const listed = filterProducts(filterable, filters);
  const typeCounts = facetCounts(filterable, filters, "category");
  /** Types de produit présents dans la liste (pas d'onglet vide : recettes, sous-recettes… ne sont pas des articles). */
  const types = PRODUCT_CATEGORIES.filter((c) => products.some((p) => p.category === c));
  const filtered = Object.entries(filters).some(([, v]) => v !== "");

  return (
    <div className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
          {state.message}
        </p>
      )}

      {groups.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Saisies « hors liste » à revoir ({groups.length})</h2>
          <p className="text-sm text-slate-600">
            Indiquez le prix d&apos;achat pour chiffrer ces pertes, rattachez chaque nom à un produit de la liste, ou
            créez le produit. Chaque déclaration reçoit une nouvelle version : le nom saisi reste visible dans son
            historique.
          </p>
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <p>
                <span className="font-semibold">« {g.label} »</span>{" "}
                <span className="text-sm text-amber-900">
                  {PRODUCT_CATEGORY_LABELS[g.category]} · {g.count} saisie{g.count > 1 && "s"} · dernière le{" "}
                  {fmtDay(g.lastOccurredOn)} ·{" "}
                  {g.priced === g.count
                    ? `chiffrée${g.count > 1 ? "s" : ""}${g.freePrice ? ` (${fmtPrice(g.freePrice)})` : ""}`
                    : g.priced
                      ? `${g.priced} chiffrée${g.priced > 1 ? "s" : ""} sur ${g.count}`
                      : "sans prix (0 €)"}
                </span>
              </p>
              <form action={action} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="intent" value="price_group" />
                <input type="hidden" name="groupKey" value={g.key} />
                <PriceFields required defaults={g.freePrice} />
                <button type="submit" disabled={pending} className="btn-secondary">
                  {g.priced ? "Changer le prix" : "Indiquer le prix"}
                </button>
              </form>
              {creatingFrom === g.key ? (
                <form action={action} className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="create_link" />
                  <input type="hidden" name="groupKey" value={g.key} />
                  <ProductFields units={units} defaults={{ name: g.label, category: g.category }} />
                  <PriceFields defaults={g.freePrice} />
                  <div className="flex gap-2">
                    <button type="submit" disabled={pending} className="btn-primary flex-1">
                      Créer et rattacher
                    </button>
                    <button type="button" className="px-4 text-slate-700" onClick={() => setCreatingFrom(null)}>
                      Fermer
                    </button>
                  </div>
                </form>
              ) : (
                <form action={action} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="intent" value="link" />
                  <input type="hidden" name="groupKey" value={g.key} />
                  <select
                    name="productId"
                    className="field min-h-12 w-full min-w-0 text-base"
                    defaultValue=""
                    aria-label="Produit de la liste"
                  >
                    <option value="" disabled>
                      {active.length ? "Choisir le produit…" : "Aucun produit dans la liste"}
                    </option>
                    {[...active]
                      .sort((a, b) => Number(b.category === g.category) - Number(a.category === g.category))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.variant && ` (${p.variant})`} — {PRODUCT_CATEGORY_LABELS[p.category]}
                        </option>
                      ))}
                  </select>
                  <button type="submit" disabled={pending || active.length === 0} className="btn-secondary">
                    Rattacher
                  </button>
                  <button
                    type="button"
                    className="font-medium text-rouge-700 underline"
                    onClick={() => setCreatingFrom(g.key)}
                  >
                    Créer ce produit
                  </button>
                </form>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">
          Matières premières des tomes ({products.filter((p) => p.melba).length})
        </h2>
        <p className="text-sm text-slate-600">
          Chaque nouvel import de la semaine ajoute les nouveaux ingrédients et enregistre les prix qui changent, sans
          toucher aux pertes passées ni aux noms modifiés ici. Les liquides (huiles, lait, crème, vinaigres, sauce
          soja…) reçoivent la densité du tableau de référence s&apos;ils n&apos;en ont pas. Ce bouton reprend les tomes
          déjà importés ; il peut être relancé sans risque.
        </p>
        <form action={action}>
          <input type="hidden" name="intent" value="build_materials" />
          <button type="submit" disabled={pending} className="btn-secondary">
            Compléter depuis les tomes importés
          </button>
        </form>
      </section>

      {!creating ? (
        <button type="button" className="btn-secondary" onClick={() => setCreating(true)}>
          + Ajouter un produit
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <input type="hidden" name="intent" value="create" />
          <h2 className="text-lg font-semibold">Nouveau produit</h2>
          <ProductFields units={units} />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary flex-1">
              Créer
            </button>
            <button type="button" className="px-4 text-slate-700" onClick={() => setCreating(false)}>
              Fermer
            </button>
          </div>
        </form>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          Liste des produits ({active.length} actif{active.length > 1 && "s"})
        </h2>
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilter("search")(e.target.value)}
          placeholder="Rechercher par nom ou code"
          className="field"
          aria-label="Rechercher un produit"
        />
        {types.length > 1 && (
          <nav aria-label="Type de produit" className="flex flex-wrap gap-2">
            {(["", ...types] as const).map((c) => (
              <button
                key={c || "tous"}
                type="button"
                onClick={() => setFilter("category")(c)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${filters.category === c ? "bg-brun-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
              >
                {c === "" ? "Tous" : `${PRODUCT_CATEGORY_LABELS[c]} (${typeCounts.get(c) ?? 0})`}
              </button>
            ))}
          </nav>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          <FacetSelect
            label="Catégorie Melba"
            all="Toutes les catégories"
            none={{ value: "aucune", label: "Sans catégorie Melba" }}
            value={filters.materialCategory}
            onChange={setFilter("materialCategory")}
            options={materialCategories}
            counts={facetCounts(filterable, filters, "materialCategory")}
          />
          <FacetSelect
            label="Fournisseur"
            all="Tous les fournisseurs"
            value={filters.supplier}
            onChange={setFilter("supplier")}
            options={suppliers}
            counts={facetCounts(filterable, filters, "supplier")}
          />
          <FacetSelect
            label="Lieu de stockage"
            all="Tous les lieux"
            none={{ value: "aucun", label: "Sans lieu de stockage" }}
            value={filters.storage}
            onChange={setFilter("storage")}
            options={places}
            counts={facetCounts(filterable, filters, "storage")}
          />
        </div>
        <p className="flex flex-wrap items-center gap-3 text-sm text-slate-600" role="status">
          {listed.length} produit{listed.length > 1 && "s"}
          {filtered && " avec ces filtres"}
          {filtered && (
            <button
              type="button"
              className="font-medium text-rouge-700 underline"
              onClick={() => setFilters(NO_FILTERS)}
            >
              Effacer les filtres
            </button>
          )}
        </p>
        {listed.length === 0 && <p className="text-slate-600">Aucun produit.</p>}
        <ul className="flex flex-col gap-2">
          {listed.map((p) => (
            <li key={p.id} className={`rounded-2xl bg-white p-4 shadow-sm ${p.active ? "" : "opacity-60"}`}>
              {editing === p.id ? (
                <form action={action} className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="productId" value={p.id} />
                  <ProductFields units={units} defaults={p} />
                  <div className="flex gap-2">
                    <button type="submit" disabled={pending} className="btn-primary flex-1">
                      Enregistrer
                    </button>
                    <button type="button" className="px-4 text-slate-700" onClick={() => setEditing(null)}>
                      Fermer
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">
                    {p.name}
                    {p.variant && <span className="font-normal text-slate-600"> ({p.variant})</span>}
                    {!p.active && (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 text-sm font-normal">Désactivé</span>
                    )}
                  </span>
                  <span className="text-sm text-slate-600">
                    {PRODUCT_CATEGORY_LABELS[p.category]}
                    {p.code && ` · code ${p.code}`} · unité{" "}
                    {units.find((u) => u.code === p.defaultUnit)?.label ?? p.defaultUnit}
                    {p.unitWeightKg != null && ` · ${fmtNumber(p.unitWeightKg)} kg par unité`}
                    {p.densityKgPerL != null &&
                      ` · densité ${fmtNumber(p.densityKgPerL)} kg/L${p.densityReference ? ` (référence : ${p.densityReference})` : ""}`}
                    {p.melba && " · tome Melba"}
                  </span>
                  {(p.materialCategory || p.storage) && (
                    <span className="text-sm text-slate-600">
                      {p.materialCategory ?? "Sans catégorie Melba"}
                      {p.storage?.name && ` · rangé en ${p.storage.name}${p.storage.own ? " (lieu propre)" : ""}`}
                    </span>
                  )}
                  {p.price ? (
                    <span className="text-sm text-slate-700">
                      Prix :{" "}
                      {[
                        p.price.perKgEur != null && `${fmtEur(p.price.perKgEur)} / kg`,
                        p.price.perUnitEur != null && `${fmtEur(p.price.perUnitEur)} / ${p.price.unit ?? "unité"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}{" "}
                      <span className="text-slate-500">
                        ({PRICE_SOURCES[p.price.source] ?? p.price.source}, depuis le {fmtDay(p.price.validFrom)}
                        {p.price.versions > 1 && ` · ${p.price.versions} versions`})
                      </span>
                    </span>
                  ) : (
                    p.melba && <span className="text-sm text-amber-800">Pas de prix dans les tomes</span>
                  )}
                  {p.comment && (
                    <p className="rounded-xl bg-brun-50 p-2 text-sm whitespace-pre-line text-slate-800">
                      <span className="font-medium">Commentaire : </span>
                      {p.comment}
                    </p>
                  )}
                  <form action={action} className="flex flex-wrap gap-4">
                    <input type="hidden" name="productId" value={p.id} />
                    <Link href={`/admin/produits/${p.id}`} className="text-sm font-medium text-rouge-700 underline">
                      Fiche : prix, colis, lieu
                    </Link>
                    <button
                      type="button"
                      className="text-sm font-medium text-rouge-700 underline"
                      onClick={() => setEditing(p.id)}
                    >
                      Modifier
                    </button>
                    <button
                      type="submit"
                      name="intent"
                      value={p.active ? "deactivate" : "activate"}
                      className={`text-sm font-medium underline ${p.active ? "text-red-800" : "text-rouge-700"}`}
                    >
                      {p.active ? "Désactiver" : "Réactiver"}
                    </button>
                    {p.deletable && (
                      <DeleteButton name={p.name} className="text-sm font-medium text-red-800 underline" />
                    )}
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ProductFields({
  units,
  defaults,
}: {
  units: { code: string; label: string }[];
  defaults?: Partial<Product>;
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nom</span>
        <input name="name" className="field" defaultValue={defaults?.name} required minLength={2} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Type de produit</span>
        <select name="category" className="field" defaultValue={defaults?.category ?? ""} required>
          <option value="" disabled>
            Choisir…
          </option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PRODUCT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Code (facultatif)</span>
          <input name="code" className="field" defaultValue={defaults?.code ?? ""} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Variante (facultatif)</span>
          <input
            name="variant"
            className="field"
            defaultValue={defaults?.variant ?? ""}
            placeholder="ex. sans gluten"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Famille d&apos;encas (facultatif)</span>
        <input
          name="snackFamily"
          className="field"
          defaultValue={defaults?.snackFamily ?? ""}
          placeholder="ex. Fromages, Crackers — encas seulement"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Unité habituelle</span>
        <select name="defaultUnit" className="field" defaultValue={defaults?.defaultUnit ?? "kg"}>
          {units.map((u) => (
            <option key={u.code} value={u.code}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Poids d&apos;une pièce ou barquette (kg)</span>
          <input
            name="unitWeightKg"
            inputMode="decimal"
            className="field"
            defaultValue={defaults?.unitWeightKg ?? ""}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Densité (kg/L)</span>
          <input
            name="densityKgPerL"
            inputMode="decimal"
            className="field"
            defaultValue={defaults?.densityKgPerL ?? ""}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Commentaire (facultatif)</span>
        <textarea
          name="comment"
          className="field min-h-20"
          maxLength={1000}
          defaultValue={defaults?.comment ?? ""}
          placeholder="ex. à vérifier avec la réception, nom à corriger dans Melba…"
        />
      </label>
      <p className="text-sm text-slate-500">
        Poids et densité : laisser vide si la valeur n&apos;est pas connue. Ils servent à convertir en kg les pertes
        comptées en pièces ou mesurées en litres.
      </p>
    </>
  );
}
