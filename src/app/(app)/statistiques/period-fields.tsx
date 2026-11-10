"use client";

import { useState } from "react";
import type { Period } from "@/domain/periodes";

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** Champs de la période : seuls ceux du type choisi sont affichés (le formulaire reste un simple GET). */
export function PeriodFields({ period, today }: { period: Period; today: string }) {
  const [kind, setKind] = useState<Period["kind"]>(period.kind);
  const year = "year" in period ? period.year : Number(today.slice(0, 4));
  const label = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  return (
    <>
      <label className={label}>
        Période
        <select name="periode" value={kind} onChange={(e) => setKind(e.target.value as Period["kind"])} className="field w-full min-w-0">
          <option value="semaine">Semaine</option>
          <option value="mois">Mois</option>
          <option value="annee">Année</option>
          <option value="periode">Dates libres</option>
        </select>
      </label>
      {kind !== "periode" && (
        <label className={label}>
          Année
          <input name="annee" type="number" min={2000} max={2100} defaultValue={year} className="field w-full min-w-0" required />
        </label>
      )}
      {kind === "semaine" && (
        <label className={label}>
          Semaine
          <input name="semaine" type="number" min={1} max={53} defaultValue={period.kind === "semaine" ? period.number : 1} className="field w-full min-w-0" required />
        </label>
      )}
      {kind === "mois" && (
        <label className={label}>
          Mois
          <select name="mois" defaultValue={period.kind === "mois" ? period.month : Number(today.slice(5, 7))} className="field w-full min-w-0">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "periode" && (
        <>
          <label className={label}>
            Du
            <input name="du" type="date" defaultValue={period.kind === "periode" ? period.from : today} className="field w-full min-w-0" required />
          </label>
          <label className={label}>
            Au
            <input name="au" type="date" defaultValue={period.kind === "periode" ? period.to : today} className="field w-full min-w-0" required />
          </label>
        </>
      )}
    </>
  );
}
