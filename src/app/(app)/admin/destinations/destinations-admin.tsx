"use client";

import { useActionState, useState } from "react";
import { DESTINATION_KIND_LABELS, DESTINATION_KINDS, type DestinationKind } from "@/modules/admin/destination-kinds";
import { type PlaceActionState, destinationAction } from "../actions";
import { Feedback } from "../feedback";

interface Destination {
  id: string;
  name: string;
  kind: DestinationKind;
  financialRecovery: boolean;
  active: boolean;
  used: boolean;
}

export function DestinationsAdmin({ destinations }: { destinations: Destination[] }) {
  const [state, action, pending] = useActionState<PlaceActionState, FormData>(destinationAction, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Feedback state={state} />
      {!creating ? (
        <button type="button" className="btn-secondary" onClick={() => setCreating(true)}>
          + Ajouter une destination
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <input type="hidden" name="intent" value="create" />
          <h2 className="text-lg font-semibold">Nouvelle destination</h2>
          <DestinationFields />
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

      <ul className="flex flex-col gap-2">
        {destinations.map((d, i) => (
          <li key={d.id} className={`rounded-2xl bg-white p-4 shadow-sm ${d.active ? "" : "opacity-60"}`}>
            {editing === d.id ? (
              <form action={action} className="flex flex-col gap-2">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="id" value={d.id} />
                <DestinationFields destination={d} />
                {d.used && <p className="text-sm text-slate-500">Déjà utilisée : seul le nom peut être reformulé.</p>}
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
                  {d.name}
                  {!d.active && <span className="ml-2 rounded-full bg-slate-200 px-2 text-sm font-normal">Désactivée</span>}
                </span>
                <span className="text-sm text-slate-600">
                  {DESTINATION_KIND_LABELS[d.kind]}
                  {d.financialRecovery && " · peut rapporter une recette"}
                </span>
                <form action={action} className="flex flex-wrap items-center gap-4">
                  <input type="hidden" name="id" value={d.id} />
                  <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(d.id)}>
                    Modifier
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value={d.active ? "deactivate" : "activate"}
                    className={`text-sm font-medium underline ${d.active ? "text-red-800" : "text-teal-800"}`}
                  >
                    {d.active ? "Désactiver" : "Réactiver"}
                  </button>
                  <span className="ml-auto flex gap-1">
                    <button type="submit" name="intent" value="up" disabled={pending || i === 0} aria-label={`Monter ${d.name}`} className="btn-order">
                      ↑
                    </button>
                    <button
                      type="submit"
                      name="intent"
                      value="down"
                      disabled={pending || i === destinations.length - 1}
                      aria-label={`Descendre ${d.name}`}
                      className="btn-order"
                    >
                      ↓
                    </button>
                  </span>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DestinationFields({ destination }: { destination?: Destination }) {
  const locked = destination?.used ?? false;
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nom</span>
        <input name="name" className="field" defaultValue={destination?.name} required minLength={2} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Type</span>
        {locked && <input type="hidden" name="kind" value={destination!.kind} />}
        <select name="kind" className="field" defaultValue={destination?.kind ?? ""} required disabled={locked}>
          <option value="" disabled>
            Choisir…
          </option>
          {DESTINATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {DESTINATION_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        {locked && destination!.financialRecovery && <input type="hidden" name="financialRecovery" value="on" />}
        <input type="checkbox" name="financialRecovery" defaultChecked={destination?.financialRecovery} disabled={locked} className="size-5" />
        Peut rapporter une recette (ventes uniquement)
      </label>
    </>
  );
}
