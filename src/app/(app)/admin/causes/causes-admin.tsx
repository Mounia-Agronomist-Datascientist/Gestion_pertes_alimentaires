"use client";

import { useActionState, useState } from "react";
import {
  AVOIDABILITIES,
  AVOIDABILITY_LABELS,
  type Avoidability,
  CAUSE_FAMILIES,
  CAUSE_FAMILY_HINTS,
  CAUSE_FAMILY_LABELS,
  type CauseFamily,
} from "@/domain/familles-causes";
import { type CauseActionState, causeAction } from "../actions";

interface Cause {
  id: string;
  name: string;
  description: string | null;
  status: "proposee" | "active" | "rejetee" | "inactive";
  isOther: boolean;
  zoneIds: string[];
  subzoneNames: string[];
  proposedByName: string | null;
  proposedAt: string | null;
  family: CauseFamily | null;
  avoidability: Avoidability | null;
  classificationValidated: boolean;
}

interface Props {
  causes: Cause[];
  zones: { id: string; name: string }[];
}

export function CausesAdmin({ causes, zones }: Props) {
  const [state, action, pending] = useActionState<CauseActionState, FormData>(causeAction, {});
  const [zoneFilter, setZoneFilter] = useState<string>(zones[0]?.id ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const pendingProposals = causes.filter((c) => c.status === "proposee");
  const toConfirm = causes.filter(
    (c) => c.status !== "rejetee" && c.status !== "proposee" && !c.classificationValidated && c.family,
  );
  const unclassified = causes.filter((c) => (c.status === "active" || c.status === "inactive") && !c.family);
  const listed = causes.filter(
    (c) => (c.status === "active" || c.status === "inactive") && (c.isOther || c.zoneIds.includes(zoneFilter)),
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

      {pendingProposals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Propositions en attente ({pendingProposals.length})</h2>
          {pendingProposals.map((c) => (
            <form
              key={c.id}
              action={action}
              className="flex flex-col gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"
            >
              <input type="hidden" name="causeId" value={c.id} />
              <p className="text-sm text-amber-900">
                Proposée par {c.proposedByName ?? "?"}
                {c.proposedAt && ` le ${new Date(c.proposedAt).toLocaleDateString("fr-FR")}`}
              </p>
              <CauseFields cause={c} zones={zones} />
              <div className="flex flex-wrap gap-3">
                <button type="submit" name="intent" value="accept" disabled={pending} className="btn-primary flex-1">
                  Valider
                </button>
                <input
                  name="reason"
                  placeholder="Motif du rejet (facultatif)"
                  className="field min-h-12 flex-1 text-base"
                />
                <button
                  type="submit"
                  name="intent"
                  value="reject"
                  disabled={pending}
                  className="font-medium text-red-800 underline"
                >
                  Rejeter
                </button>
              </div>
              <p className="text-sm text-amber-900">
                Vous pouvez reformuler le nom et choisir les zones avant de valider.
              </p>
            </form>
          ))}
        </section>
      )}

      {!creating ? (
        <button type="button" className="btn-secondary" onClick={() => setCreating(true)}>
          + Ajouter une cause
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <input type="hidden" name="intent" value="create" />
          <h2 className="text-lg font-semibold">Nouvelle cause</h2>
          <CauseFields zones={zones} defaultZoneIds={[zoneFilter]} />
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

      <nav aria-label="Zone" className="flex flex-wrap gap-2">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => setZoneFilter(z.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${zoneFilter === z.id ? "bg-brun-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
          >
            {z.name}
          </button>
        ))}
      </nav>

      <section className="flex flex-col gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <h2 className="text-lg font-semibold">Famille de cause et pertes évitables</h2>
        <p className="text-sm text-amber-950">
          Chaque cause est rangée dans une famille de causes racines et marquée évitable ou non (référentiel des pertes
          agroalimentaires). Les équipes ne voient rien de plus à la saisie : ce classement sert aux statistiques («
          pertes évitables », répartition par famille).
          {toConfirm.length > 0 &&
            ` ${toConfirm.length} classement${toConfirm.length > 1 ? "s" : ""} proposé${toConfirm.length > 1 ? "s" : ""} à vérifier.`}
          {unclassified.length > 0 && ` ${unclassified.length} cause${unclassified.length > 1 ? "s" : ""} à classer.`}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-rouge-700">Ce que regroupe chaque famille</summary>
          <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-3">
            {CAUSE_FAMILIES.map((f) => (
              <div key={f} className="contents">
                <dt className="font-medium">{CAUSE_FAMILY_LABELS[f]}</dt>
                <dd className="text-slate-600">{CAUSE_FAMILY_HINTS[f]}</dd>
              </div>
            ))}
          </dl>
        </details>
        {toConfirm.length > 0 && (
          <form action={action}>
            <button
              type="submit"
              name="intent"
              value="validate_classifications"
              disabled={pending}
              className="rounded-xl border-2 border-brun-700 bg-white px-4 py-2 font-semibold"
            >
              Valider les {toConfirm.length} classements proposés tels quels
            </button>
          </form>
        )}
      </section>

      <ul className="flex flex-col gap-2">
        {listed.map((c) => (
          <li
            key={c.id}
            className={`rounded-2xl bg-white p-4 shadow-sm ${c.status === "inactive" ? "opacity-60" : ""}`}
          >
            {editing === c.id ? (
              <form action={action} className="flex flex-col gap-2">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="causeId" value={c.id} />
                <CauseFields cause={c} zones={zones} hideZones={c.isOther} />
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
                  {c.name}
                  {c.status === "inactive" && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 text-sm font-normal">Désactivée</span>
                  )}
                </span>
                {c.description && <span className="text-sm text-slate-600">{c.description}</span>}
                <Classification cause={c} action={action} pending={pending} />
                <span className="text-sm text-slate-500">
                  {c.isOther
                    ? "Toutes les zones"
                    : zones
                        .filter((z) => c.zoneIds.includes(z.id))
                        .map((z) => z.name)
                        .join(", ")}
                  {c.subzoneNames.length > 0 && ` · uniquement : ${c.subzoneNames.join(", ")}`}
                </span>
                <form action={action} className="flex gap-4">
                  <input type="hidden" name="causeId" value={c.id} />
                  <button
                    type="button"
                    className="text-sm font-medium text-rouge-700 underline"
                    onClick={() => setEditing(c.id)}
                  >
                    Modifier
                  </button>
                  {!c.isOther && (
                    <button
                      type="submit"
                      name="intent"
                      value={c.status === "active" ? "deactivate" : "activate"}
                      className={`text-sm font-medium underline ${c.status === "active" ? "text-red-800" : "text-rouge-700"}`}
                    >
                      {c.status === "active" ? "Désactiver" : "Réactiver"}
                    </button>
                  )}
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CauseFields({
  cause,
  zones,
  defaultZoneIds,
  hideZones = false,
}: {
  cause?: Cause;
  zones: { id: string; name: string }[];
  defaultZoneIds?: string[];
  hideZones?: boolean;
}) {
  const checked = cause?.zoneIds ?? defaultZoneIds ?? [];
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nom</span>
        <input name="name" className="field" defaultValue={cause?.name} required minLength={3} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Précision (facultatif)</span>
        <input name="description" className="field" defaultValue={cause?.description ?? ""} />
      </label>
      {!hideZones && (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
          <legend className="mb-1 font-medium">Zones</legend>
          {zones.map((z) => (
            <label key={z.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="zoneIds"
                value={z.id}
                defaultChecked={checked.includes(z.id)}
                className="size-5"
              />{" "}
              {z.name}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

/** Famille et caractère évitable d'une cause : proposés (à valider) ou confirmés, modifiables sur place. */
function Classification({
  cause: c,
  action,
  pending,
}: {
  cause: Cause;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={action} className="mt-1 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-2">
      <input type="hidden" name="intent" value="classify" />
      <input type="hidden" name="causeId" value={c.id} />
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <span>Famille</span>
        <select name="family" className="field" defaultValue={c.family ?? ""} required>
          <option value="" disabled>
            À classer…
          </option>
          {CAUSE_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {CAUSE_FAMILY_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Perte</span>
        <select name="avoidability" className="field" defaultValue={c.avoidability ?? ""} required>
          <option value="" disabled>
            …
          </option>
          {AVOIDABILITIES.map((a) => (
            <option key={a} value={a}>
              {AVOIDABILITY_LABELS[a]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brun-700 px-4 py-2 text-sm font-semibold text-white"
      >
        {c.classificationValidated ? "Enregistrer" : "Valider"}
      </button>
      <span
        className={`w-full text-xs ${c.classificationValidated ? "text-emerald-800" : c.family ? "text-amber-800" : "text-red-800"}`}
      >
        {c.classificationValidated
          ? "Classement validé"
          : c.family
            ? "Classement proposé — à valider"
            : "Cause pas encore classée"}
      </span>
    </form>
  );
}
