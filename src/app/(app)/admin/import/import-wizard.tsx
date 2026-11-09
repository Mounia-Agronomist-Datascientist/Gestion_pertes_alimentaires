"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { buildWeekImport, isSnackCode } from "@/modules/imports/merge";
import { type PlanParseResult, parsePlan } from "@/modules/imports/plan/parse-plan";
import type { OpenedWorkbook } from "@/modules/imports/plan/read-workbook";
import { type TomeParseResult, parseTome } from "@/modules/imports/tome/parse-tome";
import { Feedback } from "../feedback";
import { type ImportActionState, importWeekAction } from "./actions";

type Loading<T> = { status: "idle" } | { status: "reading"; fileName: string } | { status: "error"; message: string } | ({ status: "ready"; fileName: string } & T);

const WEEK_SHEET = /^S\d{2}(\d{2})?$/;

export function ImportWizard({ existing }: { existing: { year: number; week: number; version: number }[] }) {
  const [state, action, pending] = useActionState<ImportActionState, FormData>(importWeekAction, {});
  const [tome, setTome] = useState<Loading<{ result: TomeParseResult }>>({ status: "idle" });
  const [workbook, setWorkbook] = useState<Loading<{ sheetNames: string[] }>>({ status: "idle" });
  const [sheet, setSheet] = useState("");
  const [plan, setPlan] = useState<PlanParseResult | null>(null);
  const opened = useRef<OpenedWorkbook | null>(null);
  const tomeRef = useRef<TomeParseResult | null>(null);

  const tomeWeek = tome.status === "ready" ? tome.result.recipes[0] : undefined;

  const selectSheet = (name: string) => {
    setSheet(name);
    const grid = name ? opened.current?.readSheet(name) : null;
    setPlan(grid ? parsePlan(name, grid) : null);
  };

  /** Quand le tome et le classeur sont tous deux lus (dans n'importe quel ordre), choisit l'onglet de la semaine. */
  const autoSelectSheet = async () => {
    const first = tomeRef.current?.recipes[0];
    if (!first || !opened.current) return;
    const { expectedSheetNames } = await import("@/modules/imports/plan/read-workbook");
    const match = expectedSheetNames(first.year, first.week).find((n) => opened.current!.sheetNames.includes(n));
    if (match) selectSheet(match);
  };

  const onTome = async (file: File | undefined) => {
    if (!file) return;
    setTome({ status: "reading", fileName: file.name });
    try {
      const { extractPdfItemsInBrowser } = await import("@/modules/imports/tome/pdf-items-browser");
      const result = parseTome(await extractPdfItemsInBrowser(new Uint8Array(await file.arrayBuffer())));
      tomeRef.current = result;
      setTome({ status: "ready", fileName: file.name, result });
      await autoSelectSheet();
    } catch {
      tomeRef.current = null;
      setTome({ status: "error", message: "Ce fichier n'a pas pu être lu comme un PDF." });
    }
  };

  const onWorkbook = async (file: File | undefined) => {
    if (!file) return;
    setWorkbook({ status: "reading", fileName: file.name });
    setPlan(null);
    setSheet("");
    try {
      const { openWorkbook } = await import("@/modules/imports/plan/read-workbook");
      opened.current = await openWorkbook(new Uint8Array(await file.arrayBuffer()));
      setWorkbook({ status: "ready", fileName: file.name, sheetNames: opened.current.sheetNames.filter((n) => WEEK_SHEET.test(n)) });
      await autoSelectSheet();
    } catch {
      opened.current = null;
      setWorkbook({ status: "error", message: "Ce fichier n'a pas pu être lu comme un classeur Excel (.xlsx)." });
    }
  };

  const preview = useMemo(() => (tome.status === "ready" && plan ? buildWeekImport(tome.result, plan) : null), [tome, plan]);
  const replaces = preview && existing.find((e) => e.year === preview.year && e.week === preview.week);
  const byTeam = useMemo(() => {
    const teams = new Map<string, NonNullable<typeof preview>["recipes"]>();
    for (const r of preview?.recipes ?? []) if (r.team) teams.set(r.team, [...(teams.get(r.team) ?? []), r]);
    return [...teams.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [preview]);

  const payload =
    preview && tome.status === "ready" && workbook.status === "ready" && plan
      ? JSON.stringify({ tome: tome.result, plan, tomeFileName: tome.fileName, planFileName: workbook.fileName, planSheetName: sheet })
      : "";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">1. Tome Melba (PDF)</h2>
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => onTome(e.target.files?.[0])} className="text-base" aria-label="Tome Melba (PDF)" />
        {tome.status === "reading" && <p className="text-slate-600">Lecture de « {tome.fileName} »… (quelques secondes)</p>}
        {tome.status === "error" && <p className="text-red-800">{tome.message}</p>}
        {tome.status === "ready" && (
          <p className="text-slate-700">
            {tomeWeek ? `S${tomeWeek.week}-${tomeWeek.year} : ` : ""}
            {tome.result.recipes.length} recettes, {tome.result.subRecipes.length} sous-recettes
            {tome.result.anomalies.length > 0 && ` · ${tome.result.anomalies.length} anomalie(s) de lecture`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">2. Plan de production (Excel)</h2>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => onWorkbook(e.target.files?.[0])}
          className="text-base"
          aria-label="Plan de production (Excel)"
        />
        {workbook.status === "reading" && <p className="text-slate-600">Lecture de « {workbook.fileName} »…</p>}
        {workbook.status === "error" && <p className="text-red-800">{workbook.message}</p>}
        {workbook.status === "ready" && (
          <label className="flex flex-col gap-1">
            <span className="font-medium">Onglet de la semaine</span>
            <select value={sheet} onChange={(e) => selectSheet(e.target.value)} className="field w-full min-w-0">
              <option value="">Choisir…</option>
              {workbook.sheetNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {preview && (
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">3. Aperçu {preview.week != null && `— S${preview.week}-${preview.year}`}</h2>
          {preview.errors.map((e) => (
            <p key={e} role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
              {e}
            </p>
          ))}
          {preview.warnings.length > 0 && (
            <details className="rounded-xl bg-amber-50 p-3 text-amber-950" open={preview.warnings.length <= 5}>
              <summary className="cursor-pointer font-medium">
                {preview.warnings.length} point{preview.warnings.length > 1 ? "s" : ""} à vérifier (n&apos;empêche pas l&apos;import)
              </summary>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-slate-700">
            {preview.recipes.filter((r) => r.team).length} plats répartis entre {byTeam.length} équipes ·{" "}
            {preview.recipes.filter((r) => isSnackCode(r.code)).length} encas (conditionnement, réception, stockage) ·{" "}
            {preview.subRecipes.length} sous-recettes
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {byTeam.map(([team, recipes]) => (
              <li key={team} className="rounded-xl border border-slate-200 p-3">
                <p className="font-semibold">Équipe {team}</p>
                <ul className="text-sm text-slate-700">
                  {recipes.map((r) => (
                    <li key={r.code}>
                      <span className="font-mono">{r.code}</span> {r.name}
                      {r.weekBarquettes != null && <span className="text-slate-500"> · {r.weekBarquettes} barq.</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {replaces && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-950">
              Cette semaine est déjà importée (version {replaces.version}) : la nouvelle version la remplacera, l&apos;ancienne
              reste conservée.
            </p>
          )}
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="payload" value={payload} />
            <button type="submit" disabled={pending || preview.errors.length > 0 || !payload} className="btn-primary">
              {pending ? "Enregistrement…" : `Valider l'import${preview.week != null ? ` de S${preview.week}` : ""}`}
            </button>
          </form>
        </section>
      )}
      <Feedback state={state} />
    </div>
  );
}
