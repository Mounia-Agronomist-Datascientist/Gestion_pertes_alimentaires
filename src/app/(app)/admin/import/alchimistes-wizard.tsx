"use client";

import { useActionState, useState } from "react";
import { computeProductionWeek, formatProductionWeek } from "@/domain/semaine-production";
import { type AlchimistesParseResult, csvToGrid, parseAlchimistes } from "@/modules/imports/alchimistes/parse-alchimistes";
import type { Grid } from "@/modules/imports/plan/parse-plan";
import { Feedback } from "../feedback";
import { type ImportActionState, importAlchimistesAction } from "./actions";

type FileState = { status: "idle" } | { status: "reading"; fileName: string } | { status: "error"; message: string } | { status: "ready"; fileName: string; result: AlchimistesParseResult };

const kg = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Dépôt du fichier des Alchimistes (export CSV ou Excel) : lu sur cet ordinateur ; seules les collectes sont
 * envoyées, jamais le nom du client ni de l'établissement.
 */
export function AlchimistesWizard({ coverage }: { coverage: string[] }) {
  const [state, action, pending] = useActionState<ImportActionState, FormData>(importAlchimistesAction, {});
  const [file, setFile] = useState<FileState>({ status: "idle" });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile({ status: "reading", fileName: f.name });
    try {
      let grid: Grid;
      if (/\.xlsx$/i.test(f.name)) {
        // Premier onglet, valeurs brutes (dates en numéro de série Excel, reconnues par la lecture).
        const { openLightWorkbook } = await import("@/modules/imports/decompte/read-xlsx-sheet");
        const workbook = await openLightWorkbook(new Uint8Array(await f.arrayBuffer()));
        grid = (await workbook.readSheet(workbook.sheetNames[0] ?? "")) ?? [];
      } else grid = csvToGrid(await f.text());
      setFile({ status: "ready", fileName: f.name, result: parseAlchimistes(grid) });
    } catch {
      setFile({ status: "error", message: "Ce fichier n'a pas pu être lu (CSV ou Excel .xlsx attendu)." });
    }
  };

  const result = file.status === "ready" ? file.result : null;
  const total = result?.collections.reduce((a, c) => a + c.netKg, 0) ?? 0;
  // Bacs et kg par semaine de production, calculée à partir de la date (le serveur la reprend dans le calendrier).
  const weeks = new Map<string, { bins: number; kg: number }>();
  for (const c of result?.collections ?? []) {
    const label = formatProductionWeek(computeProductionWeek(c.date));
    const w = weeks.get(label) ?? weeks.set(label, { bins: 0, kg: 0 }).get(label)!;
    w.bins++;
    w.kg += c.netKg;
  }
  const replaced = result?.periodFrom && result.periodTo ? coverage.filter((d) => d >= result.periodFrom! && d <= result.periodTo!) : [];
  const withNumber = result?.collections.filter((c) => c.containerNumber).length ?? 0;
  const payload =
    file.status === "ready" && result && !result.errors.length && result.periodFrom && result.periodTo
      ? JSON.stringify({
          fileName: file.fileName,
          periodFrom: result.periodFrom,
          periodTo: result.periodTo,
          deliveries: result.deliveries,
          collections: result.collections.map(({ row: _row, ...c }) => c),
          warnings: result.warnings,
        })
      : "";

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Pesées des Alchimistes</h2>
      <p className="text-sm text-slate-600">
        Export CSV ou Excel des rendez-vous des Alchimistes. Seules les collectes sont gardées (date, poids, bac, qualité, incident) ; le nom du client et de
        l&apos;établissement ne sont pas lus. La semaine de production est calculée à partir de la date. Ces poids servent au contrôle : ils ne
        s&apos;ajoutent jamais aux pertes déclarées.
      </p>
      <input
        type="file"
        accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="text-base"
        aria-label="Fichier des Alchimistes (CSV ou Excel)"
      />
      {file.status === "reading" && <p className="text-slate-600">Lecture de « {file.fileName} »…</p>}
      {file.status === "error" && <p className="text-red-800">{file.message}</p>}
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
          {result.collections.length > 0 && result.periodFrom && result.periodTo && (
            <>
              <p className="text-slate-700">
                Du {shortDate(result.periodFrom)} au {shortDate(result.periodTo)} : {result.collections.length} bacs collectés ·{" "}
                <span className="font-semibold">{kg.format(total)} kg</span>
                {result.deliveries > 0 && ` · ${result.deliveries} livraison${result.deliveries > 1 ? "s" : ""} de bacs vides ignorée${result.deliveries > 1 ? "s" : ""}`}
              </p>
              <p className="text-sm text-slate-600">
                {withNumber > 0 ? `N° de bac présent sur ${withNumber} collecte${withNumber > 1 ? "s" : ""}.` : "Pas de n° de bac dans ce fichier."}
              </p>
              <table className="w-full text-sm">
                <caption className="sr-only">Collectes par semaine de production</caption>
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-1 font-medium">Semaine de production</th>
                    <th className="py-1 text-right font-medium">Bacs</th>
                    <th className="py-1 text-right font-medium">Kg</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weeks].map(([label, w]) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="py-1">{label}</td>
                      <td className="py-1 text-right tabular-nums">{w.bins}</td>
                      <td className="py-1 text-right tabular-nums">{kg.format(w.kg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {replaced.length > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-950">
              Des collectes sont déjà enregistrées sur cette période (
              {replaced.length === 1 ? `le ${shortDate(replaced[0]!)}` : `${replaced.length} jours, du ${shortDate(replaced[0]!)} au ${shortDate(replaced.at(-1)!)}`}) : ce fichier
              les remplacera.
              Les anciennes restent conservées.
            </p>
          )}
          <form action={action}>
            <input type="hidden" name="payload" value={payload} />
            <button type="submit" disabled={pending || !payload} className="btn-primary w-full">
              {pending ? "Enregistrement…" : "Enregistrer les pesées"}
            </button>
          </form>
        </>
      )}
      <Feedback state={state} />
    </section>
  );
}
