"use client";

import { useActionState, useState } from "react";
import { isSnackRecipeCode, type SnackFact, snackFacts, type SnackTomeRecipe } from "@/domain/encas-tome";
import { parseTome } from "@/modules/imports/tome/parse-tome";
import { Feedback } from "../feedback";
import { type ImportActionState, importSnackTomeAction } from "./actions";

type FileState =
  | { status: "idle" }
  | { status: "reading"; fileName: string }
  | { status: "error"; message: string }
  | { status: "ready"; fileName: string; recipes: SnackTomeRecipe[]; others: number };

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const weekLabel = (f: { year: number; week: number }) => `S${String(f.week).padStart(2, "0")}-${f.year}`;

/**
 * Dépôt du PDF Melba des encas (« Imprimer les recettes », recettes EN…) : lu dans le navigateur, seules les recettes
 * d'encas sont envoyées. Sert aussi au premier chargement de tous les encas récemment utilisés (plusieurs semaines).
 */
export function SnackTomeWizard() {
  const [state, action, pending] = useActionState<ImportActionState, FormData>(importSnackTomeAction, {});
  const [file, setFile] = useState<FileState>({ status: "idle" });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile({ status: "reading", fileName: f.name });
    try {
      const { extractPdfItemsInBrowser } = await import("@/modules/imports/tome/pdf-items-browser");
      const tome = parseTome(await extractPdfItemsInBrowser(new Uint8Array(await f.arrayBuffer())));
      const recipes = tome.recipes
        .filter((r) => isSnackRecipeCode(r.code))
        .map((r) => ({
          year: r.year,
          week: r.week,
          code: r.code,
          name: r.name,
          lines: r.lines.map((l) => ({
            label: l.label,
            key: l.key,
            isSubRecipe: l.isSubRecipe,
            quantity: l.quantity,
            unit: l.unit,
            unitWeightG: l.unitWeightG,
            cost: l.cost,
          })),
          total: r.total,
        }));
      setFile({ status: "ready", fileName: f.name, recipes, others: tome.recipes.length - recipes.length });
    } catch {
      setFile({ status: "error", message: "Ce fichier n'a pas pu être lu comme un PDF." });
    }
  };

  const facts: SnackFact[] = file.status === "ready" ? snackFacts(file.recipes) : [];
  const weeks = [...new Set(facts.map(weekLabel))];
  // Aperçu : la dernière semaine lue pour chaque encas.
  const latest = [...new Map(facts.map((f) => [`${f.composite}|${f.key}`, f])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const payload =
    file.status === "ready" && file.recipes.length
      ? JSON.stringify({ fileName: file.fileName, recipes: file.recipes })
      : "";

  return (
    <section className="flex flex-col gap-3">
      <input
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="text-base"
        aria-label="PDF Melba des encas"
      />
      {file.status === "reading" && <p className="text-slate-600">Lecture de « {file.fileName} »…</p>}
      {file.status === "error" && <p className="text-red-800">{file.message}</p>}
      {file.status === "ready" && file.recipes.length === 0 && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          Aucune recette d&apos;encas (code EN…) dans ce fichier.
        </p>
      )}
      {file.status === "ready" && file.recipes.length > 0 && (
        <>
          <p className="text-slate-700">
            {file.recipes.length} recette{file.recipes.length > 1 ? "s" : ""} d&apos;encas ·{" "}
            <span className="font-semibold">
              {latest.length} encas, {weeks.length > 1 ? `semaines ${weeks.join(", ")}` : `semaine ${weeks[0]}`}
            </span>
            {file.others > 0 &&
              ` · ${file.others} autre${file.others > 1 ? "s" : ""} recette${file.others > 1 ? "s" : ""} ignorée${file.others > 1 ? "s" : ""}`}
          </p>
          <details className="rounded-xl bg-white p-3">
            <summary className="cursor-pointer font-medium">Voir les poids et les prix lus</summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 font-medium">Encas</th>
                  <th className="py-1 text-right font-medium">Poids</th>
                  <th className="py-1 text-right font-medium">Prix</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((f) => (
                  <tr key={`${f.composite}|${f.key}`} className="border-t border-slate-100">
                    <td className="py-1">
                      {f.name}
                      {f.composite && <span className="text-slate-500"> (composé)</span>}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {f.unitWeightG != null ? `${f.unitWeightG.toLocaleString("fr-FR")} g` : "—"}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {f.cost.perUnitEur != null ? euro.format(f.cost.perUnitEur) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <form action={action}>
            <input type="hidden" name="payload" value={payload} />
            <button type="submit" disabled={pending || !payload} className="btn-primary w-full">
              {pending ? "Enregistrement…" : `Mettre à jour la liste des encas (${latest.length})`}
            </button>
          </form>
        </>
      )}
      <Feedback state={state} />
    </section>
  );
}
