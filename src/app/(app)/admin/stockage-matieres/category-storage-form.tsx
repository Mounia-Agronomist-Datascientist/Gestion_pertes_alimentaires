"use client";

import { useActionState } from "react";
import { type CategoryStorageState, categoryStorageAction } from "../actions";

interface Category {
  id: string;
  name: string;
  storageSubzoneId: string | null;
  materials: number;
}

export function CategoryStorageForm({ categories, subzones }: { categories: Category[]; subzones: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<CategoryStorageState, FormData>(categoryStorageAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <ul className="flex flex-col divide-y divide-slate-100">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <label htmlFor={`cat-${c.id}`} className="min-w-0">
              <span className="font-medium">{c.name}</span>{" "}
              <span className="text-sm text-slate-500">
                ({c.materials} matière{c.materials > 1 ? "s" : ""})
              </span>
            </label>
            <select id={`cat-${c.id}`} name={`cat:${c.id}`} defaultValue={c.storageSubzoneId ?? ""} className="field w-full sm:w-72">
              <option value="">— Pas de lieu —</option>
              {subzones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
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
      <button type="submit" className="btn-primary" disabled={pending}>
        Enregistrer
      </button>
    </form>
  );
}
