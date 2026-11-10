"use client";

import { useActionState, useState } from "react";
import { PACKAGING_KIND_LABELS, PACKAGING_KINDS, type PackagingKind, PORTION_KIND_LABELS, PORTION_KINDS } from "@/modules/admin/packaging-labels";
import { type PlaceActionState, packagingAction } from "../actions";
import { Feedback } from "../feedback";

interface Item {
  id: string;
  code: string;
  name: string;
  kind: PackagingKind;
  unit: string;
  supplier: string | null;
  active: boolean;
  currentCostEur: number | null;
  versions: { id: string; unitCostEur: number; validFrom: string; validTo: string | null; source: string | null }[];
  perPortion: Partial<Record<(typeof PORTION_KINDS)[number], number>>;
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));
const fmtEur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 5 })} €`;
const fmtQty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 4 });

export function PackagingAdmin({ items, today }: { items: Item[]; today: string }) {
  const [state, action, pending] = useActionState<PlaceActionState, FormData>(packagingAction, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const portionTotal = (kind: (typeof PORTION_KINDS)[number]) =>
    items.filter((i) => i.active && i.perPortion[kind]).reduce((sum, i) => sum + (i.currentCostEur ?? 0) * i.perPortion[kind]!, 0);
  const missingCost = (kind: (typeof PORTION_KINDS)[number]) => items.some((i) => i.active && i.perPortion[kind] && i.currentCostEur == null);

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-2 sm:grid-cols-2">
        {PORTION_KINDS.map((kind) => (
          <div key={kind} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Emballages {PORTION_KIND_LABELS[kind].toLowerCase()}, aujourd&apos;hui</p>
            <p className="text-2xl font-bold">{fmtEur(Math.round(portionTotal(kind) * 100_000) / 100_000)}</p>
            {missingCost(kind) && <p className="text-sm text-amber-800">Un emballage n&apos;a pas de coût : total incomplet</p>}
          </div>
        ))}
      </section>

      {!editing && <Feedback state={state} />}

      {!creating ? (
        <button type="button" className="btn-secondary" onClick={() => setCreating(true)}>
          + Ajouter un emballage ou consommable
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <input type="hidden" name="intent" value="create" />
          <h2 className="text-lg font-semibold">Nouvel emballage ou consommable</h2>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Code interne</span>
            <input name="code" className="field" required minLength={2} placeholder="ex. BARQ-310" />
          </label>
          <ItemFields />
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

      {items.length === 0 && <p className="text-slate-600">Aucun emballage pour l&apos;instant.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className={`flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ${i.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">
                {i.name} <span className="font-mono text-sm font-normal text-slate-500">{i.code}</span>
                {!i.active && <span className="ml-2 rounded-full bg-slate-200 px-2 text-sm font-normal">Désactivé</span>}
              </span>
              <span className="text-lg font-bold">{i.currentCostEur != null ? `${fmtEur(i.currentCostEur)} / ${i.unit}` : "Coût à saisir"}</span>
            </div>
            <span className="text-sm text-slate-600">
              {PACKAGING_KIND_LABELS[i.kind]}
              {i.supplier && ` · ${i.supplier}`}
              {PORTION_KINDS.filter((k) => i.perPortion[k]).map((k) => ` · ${fmtQty(i.perPortion[k]!)} ${PORTION_KIND_LABELS[k].toLowerCase()}`)}
            </span>

            {editing === i.id ? (
              <div className="flex flex-col gap-3">
                <Feedback state={state} />
                <form action={action} className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="cost" />
                  <input type="hidden" name="id" value={i.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Nouveau coût (€ / {i.unit})</span>
                      <input name="unitCostEur" inputMode="decimal" required className="field" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">À partir du</span>
                      <input name="validFrom" type="date" required defaultValue={today} className="field" />
                    </label>
                  </div>
                  <input name="note" className="field" placeholder="Source ou motif (facultatif)" aria-label="Source ou motif" />
                  <button type="submit" disabled={pending} className="btn-primary">
                    Enregistrer le coût
                  </button>
                </form>
                <form action={action} className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="portion" />
                  <input type="hidden" name="id" value={i.id} />
                  <p className="font-medium">Quantité consommée (vide = non compté)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PORTION_KINDS.map((k) => (
                      <label key={k} className="flex flex-col gap-1">
                        <span className="text-sm">{PORTION_KIND_LABELS[k]}</span>
                        <input name={`portion_${k}`} inputMode="decimal" defaultValue={i.perPortion[k] ?? ""} className="field" />
                      </label>
                    ))}
                  </div>
                  <button type="submit" disabled={pending} className="btn-secondary">
                    Enregistrer les quantités
                  </button>
                </form>
                <form action={action} className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="id" value={i.id} />
                  <ItemFields item={i} />
                  <button type="submit" disabled={pending} className="btn-secondary">
                    Enregistrer la fiche
                  </button>
                </form>
                <button type="button" className="self-start px-1 text-slate-700" onClick={() => setEditing(null)}>
                  Fermer
                </button>
              </div>
            ) : (
              <form action={action} className="flex gap-4">
                <input type="hidden" name="id" value={i.id} />
                <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(i.id)}>
                  Modifier
                </button>
                <button
                  type="submit"
                  name="intent"
                  value={i.active ? "deactivate" : "activate"}
                  className={`text-sm font-medium underline ${i.active ? "text-red-800" : "text-teal-800"}`}
                >
                  {i.active ? "Désactiver" : "Réactiver"}
                </button>
              </form>
            )}

            {i.versions.length > 0 && (
              <details className="text-sm text-slate-600">
                <summary className="cursor-pointer">Historique des coûts ({i.versions.length})</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {i.versions.map((v) => (
                    <li key={v.id}>
                      {fmtEur(v.unitCostEur)} — du {fmtDay(v.validFrom)}
                      {v.validTo && ` au ${fmtDay(v.validTo)}`}
                      {v.validFrom > today ? " (à venir)" : (v.validTo == null || v.validTo >= today) && " (en vigueur)"}
                      {v.source && ` · ${v.source}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemFields({ item }: { item?: Item }) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nom</span>
        <input name="name" className="field" defaultValue={item?.name} required minLength={2} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Type</span>
          <select name="kind" className="field w-full min-w-0" defaultValue={item?.kind ?? ""} required>
            <option value="" disabled>
              Choisir…
            </option>
            {PACKAGING_KINDS.map((k) => (
              <option key={k} value={k}>
                {PACKAGING_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Unité</span>
          <input name="unit" className="field" defaultValue={item?.unit ?? "pièce"} required />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Fournisseur (facultatif)</span>
        <input name="supplier" className="field" defaultValue={item?.supplier ?? ""} />
      </label>
    </>
  );
}
