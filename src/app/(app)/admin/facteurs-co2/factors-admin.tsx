"use client";

import { useActionState, useState } from "react";
import { Feedback } from "../feedback";
import { type FactorActionState, factorAction } from "./actions";

export interface FactorView {
  id: string;
  version: number;
  status: "propose" | "valide" | "remplace" | "refuse";
  kgCo2ePerKg: number;
  source: string;
  sourceVersion: string | null;
  referenceDate: string | null;
  referenceCode: string | null;
  referenceName: string | null;
  stages: { label: string; value: number; retained: boolean }[] | null;
  hypotheses: string;
  createdAt: string;
  validatedAt: string | null;
  closedAt: string | null;
}

export interface FamilyView {
  id: string;
  name: string;
  category: string;
  current: FactorView | null;
  proposal: FactorView | null;
  versions: FactorView[];
}

const value = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "");
const STATUS: Record<FactorView["status"], string> = { propose: "Proposé", valide: "Validé", remplace: "Remplacé", refuse: "Refusé" };

function FactorDetail({ f }: { f: FactorView }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        <span className="font-semibold tabular-nums">{value.format(f.kgCo2ePerKg)} kg CO2e / kg</span>
        {f.referenceName && ` · ${f.referenceName}`}
        {f.referenceCode && <span className="text-slate-600"> (code AGB {f.referenceCode})</span>}
      </p>
      <p className="text-slate-600">
        Source : {f.source}
        {f.sourceVersion && ` ${f.sourceVersion}`}
        {f.referenceDate && `, données du ${date(f.referenceDate)}`}
      </p>
      <details>
        <summary className="cursor-pointer text-slate-700">{f.stages ? "Détail par étape et hypothèses" : "Hypothèses"}</summary>
        {f.stages && (
          <ul className="mt-1 flex flex-col gap-0.5 pl-1">
            {f.stages.map((s) => (
              <li key={s.label} className={`flex justify-between gap-3 tabular-nums ${s.retained ? "" : "text-slate-500"}`}>
                <span>
                  {s.label}
                  {!s.retained && " (non retenue)"}
                </span>
                <span>{value.format(s.value)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-slate-500">{f.hypotheses}</p>
      </details>
    </div>
  );
}

export function FactorsAdmin({ families, missing }: { families: FamilyView[]; missing: number }) {
  const [state, action, pending] = useActionState<FactorActionState, FormData>(factorAction, {});
  const [editing, setEditing] = useState<string | null>(null);
  const proposals = families.filter((f) => f.proposal);
  const categories = [...new Set(families.map((f) => f.category))];

  return (
    <>
      <Feedback state={state} />
      {missing > 0 && (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <input type="hidden" name="intent" value="load" />
          <p>
            {families.length === 0 ? "Aucune famille pour l'instant." : `${missing} famille${missing > 1 ? "s" : ""} de la proposition ${missing > 1 ? "manquent" : "manque"}.`} La
            proposition compte des familles alimentaires et, pour chacune, un produit cru représentatif tiré d&apos;Agribalyse 3.2. Rien n&apos;est
            utilisé avant votre validation.
          </p>
          <button type="submit" disabled={pending} className="btn-primary">
            Charger la proposition Agribalyse
          </button>
        </form>
      )}
      {proposals.length > 0 && (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 text-amber-950">
          <input type="hidden" name="intent" value="validate" />
          {proposals.map((f) => (
            <input key={f.proposal!.id} type="hidden" name="id" value={f.proposal!.id} />
          ))}
          <p>
            <strong>
              {proposals.length} facteur{proposals.length > 1 ? "s" : ""} à valider.
            </strong>{" "}
            Vérifiez le produit retenu et la valeur de chaque famille ci-dessous. Vous pouvez valider une par une, refuser, ou proposer une autre valeur.
          </p>
          <button type="submit" disabled={pending} className="btn-secondary">
            Valider les {proposals.length} propositions
          </button>
        </form>
      )}

      {categories.map((category) => (
        <section key={category} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{category}</h2>
          <ul className="flex flex-col gap-2">
            {families
              .filter((f) => f.category === category)
              .map((f) => (
                <li key={f.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{f.name}</span>
                    <span className={`text-sm ${f.current ? "text-emerald-800" : "text-slate-600"}`}>
                      {f.current ? `${value.format(f.current.kgCo2ePerKg)} kg CO2e / kg · validé (v${f.current.version})` : "Pas de facteur validé"}
                    </span>
                  </div>
                  {f.current && !f.proposal && <FactorDetail f={f.current} />}
                  {f.proposal && (
                    <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-950">Proposition (version {f.proposal.version})</p>
                      <FactorDetail f={f.proposal} />
                      <div className="flex flex-wrap gap-2">
                        <form action={action}>
                          <input type="hidden" name="intent" value="validate" />
                          <input type="hidden" name="id" value={f.proposal.id} />
                          <button type="submit" disabled={pending} className="btn-primary">
                            Valider
                          </button>
                        </form>
                        <form action={action}>
                          <input type="hidden" name="intent" value="reject" />
                          <input type="hidden" name="id" value={f.proposal.id} />
                          <button type="submit" disabled={pending} className="btn-secondary">
                            Refuser
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                  {editing === f.id ? (
                    <form action={action} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
                      <input type="hidden" name="intent" value="propose" />
                      <input type="hidden" name="familyId" value={f.id} />
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">Valeur (kg CO2e par kg)</span>
                        <input name="kgCo2ePerKg" inputMode="decimal" required className="field" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">Source</span>
                        <input name="source" required className="field" placeholder="ex. AGRIBALYSE (ADEME), fiche fournisseur" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="font-medium">Version</span>
                          <input name="sourceVersion" className="field" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-medium">Produit de référence</span>
                          <input name="referenceName" className="field" />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">Hypothèses du calcul</span>
                        <textarea name="hypotheses" required rows={3} className="field" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={pending} className="btn-primary">
                          Proposer cette valeur
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                          Annuler
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">La valeur devra ensuite être validée ; l&apos;ancienne version reste conservée.</p>
                    </form>
                  ) : (
                    <button type="button" className="self-start text-sm font-medium text-teal-800 underline" onClick={() => setEditing(f.id)}>
                      Proposer une autre valeur
                    </button>
                  )}
                  {f.versions.length > 1 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-slate-700">Historique ({f.versions.length} versions)</summary>
                      <ul className="mt-1 flex flex-col gap-1">
                        {f.versions.map((v) => (
                          <li key={v.id} className="text-slate-600">
                            v{v.version} · {STATUS[v.status]} · {value.format(v.kgCo2ePerKg)} kg CO2e / kg · {v.source}
                            {v.validatedAt && ` · validé le ${date(v.validatedAt)}`}
                            {v.closedAt && ` · clos le ${date(v.closedAt)}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
