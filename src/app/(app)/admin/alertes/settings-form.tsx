"use client";

import { useActionState } from "react";
import { Feedback } from "../feedback";
import { type SettingsActionState, updateAlertSettingsAction } from "./actions";

export interface SettingsValues {
  unusualPercent: number;
  minKg: number;
  recurrenceWeeks: number;
  stablePercent: number;
}

const FIELDS: { name: keyof SettingsValues; label: string; help: string; unit: string; step: string }[] = [
  { name: "unusualPercent", label: "Perte inhabituelle : dépassement de la moyenne", help: "Par rapport aux 4 semaines précédentes (décidé le 16/11/2026 : 50 %).", unit: "%", step: "1" },
  { name: "minKg", label: "Perte inhabituelle : pertes minimales de la semaine", help: "Aucune alerte en dessous (décidé : 5 kg).", unit: "kg", step: "0.5" },
  { name: "recurrenceWeeks", label: "Cause récurrente : semaines de suite", help: "Même cause en tête (décidé : 3 semaines).", unit: "semaines", step: "1" },
  { name: "stablePercent", label: "Tendance stable : écart maximal", help: "Entre les 4 dernières semaines et les 4 d'avant (proposé : 10 %).", unit: "%", step: "1" },
];

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(updateAlertSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm">
      {FIELDS.map((f) => (
        <label key={f.name} className="flex flex-col gap-1">
          <span className="font-medium">{f.label}</span>
          <span className="flex items-center gap-2">
            <input name={f.name} type="number" inputMode="decimal" step={f.step} min="0" required defaultValue={values[f.name]} className="field w-32" />
            <span className="text-slate-600">{f.unit}</span>
          </span>
          <span className="text-sm text-slate-600">{f.help}</span>
        </label>
      ))}
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
