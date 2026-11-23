"use client";

import { useActionState, useState } from "react";
import {
  type NamedGrid,
  parseSurplus,
  SURPLUS_SOURCE_LABELS,
  type SurplusParseResult,
  type SurplusSource,
  sheetsToRead,
} from "@/modules/imports/surplus/parse-surplus";
import { Feedback } from "../feedback";
import { type ImportActionState, importSurplusAction } from "./actions";

type FileState =
  | { status: "idle" }
  | { status: "reading"; fileName: string }
  | { status: "error"; message: string }
  | { status: "ready"; fileName: string; result: SurplusParseResult };

const int = new Intl.NumberFormat("fr-FR");
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

interface YearRow {
  year: string;
  lines: number;
  trays: number;
  breakfastTrays: number;
  amount: number;
  payouts: number;
  payoutAmount: number;
  collections: Set<string>;
}

/** Totaux par année de l'aperçu. */
function byYear(result: SurplusParseResult): YearRow[] {
  const years = new Map<string, YearRow>();
  for (const e of result.entries) {
    const y = e.date.slice(0, 4);
    const row =
      years.get(y) ??
      years
        .set(y, {
          year: y,
          lines: 0,
          trays: 0,
          breakfastTrays: 0,
          amount: 0,
          payouts: 0,
          payoutAmount: 0,
          collections: new Set(),
        })
        .get(y)!;
    if (e.kind === "versement") {
      row.payouts++;
      row.payoutAmount += e.amountEur ?? 0;
      continue;
    }
    row.lines++;
    row.trays += e.trays;
    row.breakfastTrays += e.breakfastTrays;
    row.amount += e.amountEur ?? 0;
    row.collections.add(e.date);
  }
  return [...years.values()].sort((a, b) => a.year.localeCompare(b.year));
}

/**
 * Dépôt des fichiers de ventes et de dons des surplus (« VENTES TGTG », « VENTES FLASH », Linkee), téléchargés
 * depuis Google Sheets en Excel : lus sur cet ordinateur, le type de fichier est reconnu tout seul. Seules les
 * ventes, versements et dons sont envoyés ; les contacts du fichier Linkee ne sont jamais lus.
 */
export function SurplusWizard({
  coverage,
}: {
  coverage: Partial<Record<SurplusSource, { from: string; to: string; entries: number }>>;
}) {
  const [state, action, pending] = useActionState<ImportActionState, FormData>(importSurplusAction, {});
  const [file, setFile] = useState<FileState>({ status: "idle" });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile({ status: "reading", fileName: f.name });
    try {
      if (!/\.xlsx$/i.test(f.name)) {
        setFile({
          status: "error",
          message: "Fichier Excel (.xlsx) attendu : dans Google Sheets, Fichier → Télécharger → Microsoft Excel.",
        });
        return;
      }
      const { openLightWorkbook } = await import("@/modules/imports/decompte/read-xlsx-sheet");
      const workbook = await openLightWorkbook(new Uint8Array(await f.arrayBuffer()));
      const sheets: NamedGrid[] = [];
      for (const name of sheetsToRead(workbook.sheetNames))
        sheets.push({ name, grid: (await workbook.readSheet(name)) ?? [] });
      setFile({ status: "ready", fileName: f.name, result: parseSurplus(sheets) });
    } catch {
      setFile({ status: "error", message: "Ce fichier n'a pas pu être lu (Excel .xlsx attendu)." });
    }
  };

  const result = file.status === "ready" ? file.result : null;
  const years = result ? byYear(result) : [];
  const source = result?.source ?? null;
  const covered = source ? coverage[source] : undefined;
  const overlaps =
    covered &&
    result?.periodFrom &&
    result.periodTo &&
    covered.from <= result.periodTo &&
    covered.to >= result.periodFrom;
  const payload =
    file.status === "ready" && result && source && !result.errors.length && result.periodFrom && result.periodTo
      ? JSON.stringify({
          source,
          fileName: file.fileName,
          sheets: result.sheets,
          periodFrom: result.periodFrom,
          periodTo: result.periodTo,
          entries: result.entries.map(({ sheet: _sheet, row: _row, ...e }) => e),
          warnings: result.warnings,
        })
      : "";

  return (
    <section className="flex flex-col gap-3">
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="text-base"
        aria-label="Fichier des ventes ou des dons (Excel)"
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
          {source && result.periodFrom && result.periodTo && result.entries.length > 0 && (
            <>
              <p className="text-slate-700">
                <span className="font-semibold">{SURPLUS_SOURCE_LABELS[source]}</span> · onglet
                {result.sheets.length > 1 ? "s" : ""} {result.sheets.join(", ")} · du {shortDate(result.periodFrom)} au{" "}
                {shortDate(result.periodTo)}
              </p>
              <table className="w-full text-sm">
                <caption className="sr-only">Totaux par année</caption>
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-1 font-medium">Année</th>
                    <th className="py-1 text-right font-medium">{source === "linkee" ? "Collectes" : "Ventes"}</th>
                    <th className="py-1 text-right font-medium">Barquettes</th>
                    {source === "vente_flash" && <th className="py-1 text-right font-medium">Petits-déj.</th>}
                    {source !== "linkee" && (
                      <th className="py-1 text-right font-medium">
                        {source === "tgtg" ? "Prix payé par les clients" : "CA TTC"}
                      </th>
                    )}
                    {source === "tgtg" && <th className="py-1 text-right font-medium">Reçu HT</th>}
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => (
                    <tr key={y.year} className="border-t border-slate-100">
                      <td className="py-1">{y.year}</td>
                      <td className="py-1 text-right tabular-nums">
                        {int.format(source === "linkee" ? y.collections.size : y.lines)}
                      </td>
                      <td className="py-1 text-right tabular-nums">{int.format(y.trays)}</td>
                      {source === "vente_flash" && (
                        <td className="py-1 text-right tabular-nums">{int.format(y.breakfastTrays)}</td>
                      )}
                      {source !== "linkee" && <td className="py-1 text-right tabular-nums">{euro.format(y.amount)}</td>}
                      {source === "tgtg" && (
                        <td className="py-1 text-right tabular-nums">
                          {euro.format(y.payoutAmount)} ({y.payouts} versement{y.payouts > 1 ? "s" : ""})
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {source === "linkee" && (
                <p className="text-sm text-slate-600">
                  {result.entries.filter((e) => e.dishCode).length} plats sur {result.entries.length} ont un code plat
                  dans leur n° de lot : leur poids et leur coût seront calculés à l&apos;enregistrement d&apos;après
                  l&apos;import Melba de leur semaine de production.
                </p>
              )}
            </>
          )}
          {overlaps && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-950">
              {int.format(covered.entries)} ligne{covered.entries > 1 ? "s" : ""} {SURPLUS_SOURCE_LABELS[source!]} déjà
              enregistrée{covered.entries > 1 ? "s" : ""} (du {shortDate(covered.from)} au {shortDate(covered.to)}) :
              celles de la période du fichier seront remplacées. Les anciennes restent conservées.
            </p>
          )}
          <form action={action}>
            <input type="hidden" name="payload" value={payload} />
            <button type="submit" disabled={pending || !payload} className="btn-primary w-full">
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </>
      )}
      <Feedback state={state} />
    </section>
  );
}
