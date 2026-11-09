"use client";

import { useActionState, useState } from "react";
import { type PlaceActionState, zoneAction } from "../actions";
import { Feedback } from "../feedback";

interface Subzone {
  id: string;
  name: string;
  description: string | null;
  teamMode: "equipe" | "zone";
  active: boolean;
}

interface Zone {
  id: string;
  name: string;
  subzones: Subzone[];
}

export function ZonesAdmin({ zones }: { zones: Zone[] }) {
  const [state, action, pending] = useActionState<PlaceActionState, FormData>(zoneAction, {});
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const zone = zones.find((z) => z.id === zoneId);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Zone" className="flex flex-wrap gap-2">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => {
              setZoneId(z.id);
              setEditing(null);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium ${zoneId === z.id ? "bg-teal-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
          >
            {z.name}
          </button>
        ))}
      </nav>
      <Feedback state={state} />

      {zone && (
        <>
          {editing === zone.id ? (
            <form action={action} className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <input type="hidden" name="intent" value="rename_zone" />
              <input type="hidden" name="id" value={zone.id} />
              <label className="flex flex-1 flex-col gap-1">
                <span className="font-medium">Nom de la zone</span>
                <input name="name" className="field" defaultValue={zone.name} required minLength={2} />
              </label>
              <button type="submit" disabled={pending} className="btn-primary">
                Enregistrer
              </button>
              <button type="button" className="px-2 py-3 text-slate-700" onClick={() => setEditing(null)}>
                Fermer
              </button>
            </form>
          ) : (
            <p className="flex flex-wrap items-baseline gap-3">
              <span className="text-lg font-semibold">{zone.name}</span>
              <span className="text-sm text-slate-600">
                Pertes attribuées {zone.subzones[0]?.teamMode === "equipe" ? "à l'équipe" : "à la zone"}
              </span>
              <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(zone.id)}>
                Renommer la zone
              </button>
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {zone.subzones.map((sz, i) => (
              <li key={sz.id} className={`rounded-2xl bg-white p-4 shadow-sm ${sz.active ? "" : "opacity-60"}`}>
                {editing === sz.id ? (
                  <form action={action} className="flex flex-col gap-2">
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="id" value={sz.id} />
                    <SubzoneFields subzone={sz} />
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
                      {sz.name}
                      {!sz.active && <span className="ml-2 rounded-full bg-slate-200 px-2 text-sm font-normal">Désactivé</span>}
                    </span>
                    {sz.description && <span className="text-sm text-slate-600">{sz.description}</span>}
                    <form action={action} className="flex flex-wrap items-center gap-4">
                      <input type="hidden" name="id" value={sz.id} />
                      <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(sz.id)}>
                        Modifier
                      </button>
                      <button
                        type="submit"
                        name="intent"
                        value={sz.active ? "deactivate" : "activate"}
                        className={`text-sm font-medium underline ${sz.active ? "text-red-800" : "text-teal-800"}`}
                      >
                        {sz.active ? "Désactiver" : "Réactiver"}
                      </button>
                      <span className="ml-auto flex gap-1">
                        <button type="submit" name="intent" value="up" disabled={pending || i === 0} aria-label={`Monter ${sz.name}`} className="btn-order">
                          ↑
                        </button>
                        <button
                          type="submit"
                          name="intent"
                          value="down"
                          disabled={pending || i === zone.subzones.length - 1}
                          aria-label={`Descendre ${sz.name}`}
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

          {editing === `new:${zone.id}` ? (
            <form action={action} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <input type="hidden" name="intent" value="create" />
              <input type="hidden" name="zoneId" value={zone.id} />
              <h2 className="text-lg font-semibold">Nouveau poste — {zone.name}</h2>
              <SubzoneFields />
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className="btn-primary flex-1">
                  Créer
                </button>
                <button type="button" className="px-4 text-slate-700" onClick={() => setEditing(null)}>
                  Fermer
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setEditing(`new:${zone.id}`)}>
              + Ajouter un poste
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SubzoneFields({ subzone }: { subzone?: Subzone }) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nom du poste</span>
        <input name="name" className="field" defaultValue={subzone?.name} required minLength={2} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Précision (facultatif)</span>
        <input name="description" className="field" defaultValue={subzone?.description ?? ""} />
      </label>
    </>
  );
}
