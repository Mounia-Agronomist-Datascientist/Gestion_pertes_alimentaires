"use client";

import { useActionState, useState } from "react";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { type ProductActionState, productAction } from "../actions";

type Category = (typeof PRODUCT_CATEGORIES)[number];

interface Product {
  id: string;
  name: string;
  category: Category;
  code: string | null;
  variant: string | null;
  defaultUnit: string;
  unitWeightKg: number | null;
  densityKgPerL: number | null;
  source: string;
  active: boolean;
}

interface Group {
  key: string;
  label: string;
  category: Category;
  count: number;
  lastOccurredOn: string;
}

interface Props {
  products: Product[];
  groups: Group[];
  units: { code: string; label: string }[];
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));
const fmtNumber = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
/** Comparaison sans accents ni majuscules, comme pour les doublons côté serveur. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ProductsAdmin({ products, groups, units }: Props) {
  const [state, action, pending] = useActionState<ProductActionState, FormData>(productAction, {});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "toutes">("toutes");
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);

  const active = products.filter((p) => p.active);
  const listed = products.filter(
    (p) =>
      (category === "toutes" || p.category === category) &&
      fold(`${p.name} ${p.variant ?? ""} ${p.code ?? ""}`).includes(fold(search.trim())),
  );

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
            Rattachez chaque nom saisi à un produit de la liste, ou créez le produit. Chaque déclaration reçoit une
            nouvelle version : le nom saisi reste visible dans son historique.
          </p>
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <p>
                <span className="font-semibold">« {g.label} »</span>{" "}
                <span className="text-sm text-amber-900">
                  {PRODUCT_CATEGORY_LABELS[g.category]} · {g.count} saisie{g.count > 1 && "s"} · dernière le {fmtDay(g.lastOccurredOn)}
                </span>
              </p>
              {creatingFrom === g.key ? (
                <form action={action} className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="create_link" />
                  <input type="hidden" name="groupKey" value={g.key} />
                  <ProductFields units={units} defaults={{ name: g.label, category: g.category }} />
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
                  <select name="productId" className="field min-h-12 flex-1 text-base" defaultValue="" aria-label="Produit de la liste">
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
                  <button type="button" className="font-medium text-teal-800 underline" onClick={() => setCreatingFrom(g.key)}>
                    Créer ce produit
                  </button>
                </form>
              )}
            </div>
          ))}
        </section>
      )}

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
        <h2 className="text-lg font-semibold">Liste des produits ({active.length} actif{active.length > 1 && "s"})</h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou code"
          className="field"
          aria-label="Rechercher un produit"
        />
        <nav aria-label="Type de produit" className="flex flex-wrap gap-2">
          {(["toutes", ...PRODUCT_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${category === c ? "bg-teal-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
            >
              {c === "toutes" ? "Tous" : PRODUCT_CATEGORY_LABELS[c]}
            </button>
          ))}
        </nav>
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
                    {!p.active && <span className="ml-2 rounded-full bg-slate-200 px-2 text-sm font-normal">Désactivé</span>}
                  </span>
                  <span className="text-sm text-slate-600">
                    {PRODUCT_CATEGORY_LABELS[p.category]}
                    {p.code && ` · code ${p.code}`} · unité {units.find((u) => u.code === p.defaultUnit)?.label ?? p.defaultUnit}
                    {p.unitWeightKg != null && ` · ${fmtNumber(p.unitWeightKg)} kg par unité`}
                    {p.densityKgPerL != null && ` · densité ${fmtNumber(p.densityKgPerL)} kg/L`}
                  </span>
                  <form action={action} className="flex gap-4">
                    <input type="hidden" name="productId" value={p.id} />
                    <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(p.id)}>
                      Modifier
                    </button>
                    <button
                      type="submit"
                      name="intent"
                      value={p.active ? "deactivate" : "activate"}
                      className={`text-sm font-medium underline ${p.active ? "text-red-800" : "text-teal-800"}`}
                    >
                      {p.active ? "Désactiver" : "Réactiver"}
                    </button>
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

function ProductFields({ units, defaults }: { units: Props["units"]; defaults?: Partial<Product> }) {
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
          <input name="variant" className="field" defaultValue={defaults?.variant ?? ""} placeholder="ex. sans gluten" />
        </label>
      </div>
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
          <input name="unitWeightKg" inputMode="decimal" className="field" defaultValue={defaults?.unitWeightKg ?? ""} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Densité (kg/L)</span>
          <input name="densityKgPerL" inputMode="decimal" className="field" defaultValue={defaults?.densityKgPerL ?? ""} />
        </label>
      </div>
      <p className="text-sm text-slate-500">
        Poids et densité : laisser vide si la valeur n&apos;est pas connue. Ils servent à convertir en kg les pertes
        comptées en pièces ou mesurées en litres.
      </p>
    </>
  );
}
