"use client";

import { useActionState, useRef, useState } from "react";
import { type DecompteParseResult, type DecompteWeek, decompteWeeks, parseDecompte } from "@/modules/imports/decompte/parse-decompte";
import type { LightWorkbook } from "@/modules/imports/decompte/read-xlsx-sheet";
import { Feedback } from "../feedback";
import { type ImportActionState, importDecompteAction } from "./actions";

type FileState = { status: "idle" } | { status: "reading"; fileName: string } | { status: "error"; message: string } | { status: "ready"; fileName: string; weeks: DecompteWeek[] };

/**
 * Dépôt du « Décompte barquettes » (Excel téléchargé depuis Google Sheets) : seul l'onglet « Semaine NN » choisi
 * est lu ; seuls les codes et les barquettes produites sont envoyés.
 */
export function DecompteWizard({ existing }: { existing: { year: number; week: number; version: number }[] }) {
  const [state, action, pending] = useActionState<ImportActionState, FormData>(importDecompteAction, {});
  const [file, setFile] = useState<FileState>({ status: "idle" });
  const [week, setWeek] = useState<DecompteWeek | null>(null);
  const [result, setResult] = useState<DecompteParseResult | null>(null);
  const opened = useRef<LightWorkbook | null>(null);

  const select = async (w: DecompteWeek | null) => {
    setWeek(w);
    setResult(null);
    const grid = w ? await opened.current?.readSheet(w.sheetName) : null;
    setResult(grid ? parseDecompte(grid) : null);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile({ status: "reading", fileName: f.name });
    select(null);
    try {
      // Lecture ciblée : le classeur complet (≈ 50 Mo, 250 onglets) saturerait la mémoire du navigateur.
      const { openLightWorkbook } = await import("@/modules/imports/decompte/read-xlsx-sheet");
      opened.current = await openLightWorkbook(new Uint8Array(await f.arrayBuffer()));
      const weeks = decompteWeeks(opened.current.sheetNames);
      setFile({ status: "ready", fileName: f.name, weeks });
      await select(weeks[0] ?? null);
    } catch {
      opened.current = null;
      setFile({ status: "error", message: "Ce fichier n'a pas pu être lu comme un classeur Excel (.xlsx)." });
    }
  };

  const total = result?.rows.reduce((a, r) => a + r.made, 0) ?? 0;
  const replaces = week && existing.find((e) => e.year === week.year && e.week === week.week);
  const payload =
    file.status === "ready" && week && result && !result.errors.length
      ? JSON.stringify({ fileName: file.fileName, sheetName: week.sheetName, year: week.year, week: week.week, rows: result.rows.map(({ code, made }) => ({ code, made })), warnings: result.warnings })
      : "";

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Barquettes réellement produites (Décompte barquettes)</h2>
      <p className="text-sm text-slate-600">
        Après la semaine : Google Sheets « Décompte barquettes » → Fichier → Télécharger → Microsoft Excel. Seule la colonne « Ma production »
        de l&apos;onglet « Semaine NN » est lue ; les onglets des jours (noms des opérateurs) ne sont jamais lus.
      </p>
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="text-base"
        aria-label="Décompte barquettes (Excel)"
      />
      {file.status === "reading" && <p className="text-slate-600">Lecture de « {file.fileName} »…</p>}
      {file.status === "error" && <p className="text-red-800">{file.message}</p>}
      {file.status === "ready" && file.weeks.length === 0 && <p className="text-red-800">Aucun onglet « Semaine NN » avec ses jours dans ce fichier.</p>}
      {file.status === "ready" && file.weeks.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="font-medium">Semaine</span>
          <select
            value={week ? week.sheetName : ""}
            onChange={(e) => select(file.weeks.find((w) => w.sheetName === e.target.value) ?? null)}
            className="field w-full min-w-0"
          >
            {file.weeks.map((w) => (
              <option key={w.sheetName} value={w.sheetName}>
                S{String(w.week).padStart(2, "0")}-{w.year} (onglet « {w.sheetName} »)
              </option>
            ))}
          </select>
        </label>
      )}
      {result && (
        <>
          {result.errors.map((e) => (
            <p key={e} role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
              {e}
            </p>
          ))}
          {result.warnings.length > 0 && (
            <details className="rounded-xl bg-amber-50 p-3 text-amber-950">
              <summary className="cursor-pointer font-medium">
                {result.warnings.length} point{result.warnings.length > 1 ? "s" : ""} à vérifier
              </summary>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {result.rows.length > 0 && (
            <p className="text-slate-700">
              {result.rows.length} codes · <span className="font-semibold">{total.toLocaleString("fr-FR")} barquettes produites</span>
            </p>
          )}
          {replaces && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-950">
              Le décompte de cette semaine est déjà enregistré (version {replaces.version}) : la nouvelle version le remplacera, l&apos;ancienne reste
              conservée.
            </p>
          )}
          <form action={action}>
            <input type="hidden" name="payload" value={payload} />
            <button type="submit" disabled={pending || !payload} className="btn-primary w-full">
              {pending ? "Enregistrement…" : week ? `Enregistrer le décompte de S${String(week.week).padStart(2, "0")}` : "Enregistrer"}
            </button>
          </form>
        </>
      )}
      <Feedback state={state} />
    </section>
  );
}
