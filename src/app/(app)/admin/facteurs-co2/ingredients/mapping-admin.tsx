"use client";

import { useActionState, useMemo, useState } from "react";
import { Feedback } from "../../feedback";
import { type FactorActionState, ingredientMappingAction } from "../actions";

type Status = "famille" | "non_couvert" | "non_alimentaire";

export interface MappingRow {
  key: string;
  label: string;
  uses: number;
  mapping: { status: Status; familyId: string | null } | null;
  /** Valeur de la suggestion dans la liste (« f:<id> », « non_alimentaire »), ou null. */
  suggestion: string | null;
}

export interface FamilyOption {
  id: string;
  name: string;
  category: string;
  validated: boolean;
}

type Filter = "a_rattacher" | "a_revoir" | "rattaches" | "tous";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "a_rattacher", label: "À rattacher" },
  { value: "a_revoir", label: "À revoir" },
  { value: "rattaches", label: "Rattachés" },
  { value: "tous", label: "Tous" },
];

const valueOf = (m: MappingRow["mapping"]) => (!m ? "" : m.status === "famille" ? `f:${m.familyId}` : m.status);
const entryOf = (row: MappingRow, value: string) =>
  value.startsWith("f:") ? { key: row.key, label: row.label, status: "famille" as const, familyId: value.slice(2) } : { key: row.key, label: row.label, status: value as Status, familyId: null };
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function MappingAdmin({ rows, families }: { rows: MappingRow[]; families: FamilyOption[] }) {
  const [state, action, pending] = useActionState<FactorActionState, FormData>(ingredientMappingAction, {});
  const [filter, setFilter] = useState<Filter>("a_rattacher");
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const categories = [...new Set(families.map((f) => f.category))];
  const familyName = new Map(families.map((f) => [`f:${f.id}`, f.name]));
  const label = (value: string) => familyName.get(value) ?? (value === "non_couvert" ? "Non couvert" : value === "non_alimentaire" ? "Non alimentaire" : "");

  // Rattachement validé qui diffère de la suggestion actuelle (suggestions corrigées depuis) : à vérifier.
  const toReview = (r: MappingRow) => r.mapping != null && r.suggestion != null && valueOf(r.mapping) !== r.suggestion;
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === "tous" || (filter === "a_revoir" ? toReview(r) : (filter === "rattaches") === (r.mapping != null))) &&
          (!search.trim() || normalize(r.label).includes(normalize(search.trim()))),
      ),
    [rows, filter, search],
  );
  const reviewCount = rows.filter(toReview).length;
  const choiceOf = (r: MappingRow) => choices[r.key] ?? (filter === "a_revoir" && r.suggestion ? r.suggestion : valueOf(r.mapping) || r.suggestion || "");
  const pendingSuggestions = shown.filter((r) => !r.mapping && choiceOf(r));
  // « À revoir » : remplacer les rattachements affichés par la suggestion actuelle (ou le choix fait dans la liste).
  const reviewed = filter === "a_revoir" ? shown.filter((r) => choiceOf(r) && choiceOf(r) !== valueOf(r.mapping)) : [];
  const done = rows.filter((r) => r.mapping).length;
  const usesDone = rows.filter((r) => r.mapping).reduce((a, r) => a + r.uses, 0);
  const usesTotal = rows.reduce((a, r) => a + r.uses, 0);

  return (
    <>
      <p className="text-sm text-slate-700">
        {done} ingrédient{done > 1 ? "s" : ""} rattaché{done > 1 ? "s" : ""} sur {rows.length}, soit {usesTotal ? Math.round((usesDone / usesTotal) * 100) : 0} % des lignes de
        recette.
      </p>
      <Feedback state={state} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <nav className="flex flex-wrap gap-2" aria-label="Filtre">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${filter === f.value ? "bg-teal-700 text-white" : "bg-white text-slate-700 shadow-sm"}`}
            >
              {f.label}
              {f.value === "a_revoir" && reviewCount > 0 && ` (${reviewCount})`}
            </button>
          ))}
        </nav>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un ingrédient" className="field sm:ml-auto sm:w-64" aria-label="Rechercher un ingrédient" />
      </div>
      {pendingSuggestions.length > 0 && (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 text-amber-950">
          <input type="hidden" name="entries" value={JSON.stringify(pendingSuggestions.map((r) => entryOf(r, choiceOf(r))))} />
          <p>
            {pendingSuggestions.length} ingrédient{pendingSuggestions.length > 1 ? "s" : ""} affiché{pendingSuggestions.length > 1 ? "s" : ""} avec une famille proposée. Vérifiez la
            liste ci-dessous, corrigez si besoin, puis validez.
          </p>
          <button type="submit" disabled={pending} className="btn-secondary">
            Valider les {pendingSuggestions.length} rattachements affichés
          </button>
        </form>
      )}
      {reviewed.length > 0 && (
        <form action={action} className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 text-amber-950">
          <input type="hidden" name="entries" value={JSON.stringify(reviewed.map((r) => entryOf(r, choiceOf(r))))} />
          <p>
            {reviewed.length} rattachement{reviewed.length > 1 ? "s" : ""} diffère{reviewed.length > 1 ? "nt" : ""} de la suggestion actuelle (familles ajoutées ou
            suggestions corrigées depuis). Chaque liste affiche la suggestion ; pour garder votre choix précédent (écrit sous le nom), remettez-le dans la liste.
          </p>
          <button type="submit" disabled={pending} className="btn-secondary">
            Appliquer les {reviewed.length} suggestions affichées
          </button>
        </form>
      )}
      {shown.length === 0 && <p className="text-slate-600">Aucun ingrédient dans cette liste.</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((r) => {
          const choice = choiceOf(r);
          const saved = valueOf(r.mapping);
          const changed = choice !== saved;
          return (
            <li key={r.key} className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{r.label}</span>
                <span className="text-xs text-slate-600">
                  {r.uses} ligne{r.uses > 1 ? "s" : ""} de recette
                  {r.mapping ? ` · rattaché : ${label(saved)}` : r.suggestion ? ` · proposé : ${label(r.suggestion)}` : " · aucune proposition"}
                </span>
                {toReview(r) && <span className="text-xs text-amber-800">Suggestion actuelle : {label(r.suggestion!)}. À vérifier.</span>}
              </div>
              <form action={action} className="flex gap-2">
                <input type="hidden" name="entries" value={choice ? JSON.stringify([entryOf(r, choice)]) : "[]"} />
                <select
                  value={choice}
                  onChange={(e) => setChoices((prev) => ({ ...prev, [r.key]: e.target.value }))}
                  className="field min-w-0 flex-1 sm:w-64"
                  aria-label={`Famille de ${r.label}`}
                >
                  <option value="">Choisir…</option>
                  {categories.map((c) => (
                    <optgroup key={c} label={c}>
                      {families
                        .filter((f) => f.category === c)
                        .map((f) => (
                          <option key={f.id} value={`f:${f.id}`}>
                            {f.name}
                            {f.validated ? "" : " (facteur à valider)"}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                  <optgroup label="Sans famille">
                    <option value="non_couvert">Non couvert (épices, fonds…)</option>
                    <option value="non_alimentaire">Non alimentaire (contenant…)</option>
                  </optgroup>
                </select>
                <button type="submit" disabled={pending || !choice || !changed} className="btn-primary shrink-0">
                  {r.mapping && !changed ? "Enregistré" : "Valider"}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
