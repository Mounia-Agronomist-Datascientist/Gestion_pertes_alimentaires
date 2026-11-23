"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ParsedPurchaseOrder } from "@/modules/imports/bons-commande/parse-bon";
import { savePurchaseOrdersAction } from "./actions";

type Failure = { fileName: string; error: string };
type Reading =
  | { status: "idle" }
  | { status: "reading"; done: number; total: number }
  | { status: "ready"; orders: ParsedPurchaseOrder[]; failures: Failure[]; ignored: number };
type Saving =
  | { status: "idle" }
  | { status: "saving"; done: number; total: number }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

const BATCH = 40;
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const baseName = (path: string) => path.replace(/^.*\//, "");

const groupBySupplier = (orders: ParsedPurchaseOrder[]) => {
  const groups = new Map<string, ParsedPurchaseOrder[]>();
  for (const o of orders) groups.set(o.supplier, [...(groups.get(o.supplier) ?? []), o]);
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
};

/** PDF déposés directement, ou contenus dans un ZIP (dossier téléchargé depuis le Drive). */
async function pdfFiles(files: File[]): Promise<{ pdfs: { name: string; data: Uint8Array }[]; ignored: number }> {
  const pdfs: { name: string; data: Uint8Array }[] = [];
  let ignored = 0;
  for (const f of files) {
    if (/\.pdf$/i.test(f.name)) {
      pdfs.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    } else if (/\.zip$/i.test(f.name)) {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || entry.name.includes("__MACOSX")) continue;
        if (/\.pdf$/i.test(entry.name))
          pdfs.push({ name: baseName(entry.name), data: await entry.async("uint8array") });
        else ignored++;
      }
    } else {
      ignored++;
    }
  }
  return { pdfs, ignored };
}

/**
 * Dépôt des bons de commande Melba (docs/PHASE6.md, étape 6.8) : un ou plusieurs PDF, ou le dossier du Drive
 * téléchargé en ZIP. Les PDF sont lus sur cet ordinateur ; seules les lignes lues sont envoyées, jamais les
 * adresses e-mail. Un bon déjà déposé (même numéro) est remplacé.
 */
export function PurchaseOrdersWizard() {
  const router = useRouter();
  const [reading, setReading] = useState<Reading>({ status: "idle" });
  const [saving, setSaving] = useState<Saving>({ status: "idle" });

  const onFiles = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setSaving({ status: "idle" });
    setReading({ status: "reading", done: 0, total: files.length });
    const { pdfs, ignored } = await pdfFiles(files);
    const { extractPdfItemsInBrowser } = await import("@/modules/imports/tome/pdf-items-browser");
    const { parsePurchaseOrder } = await import("@/modules/imports/bons-commande/parse-bon");
    const byNumber = new Map<string, ParsedPurchaseOrder>();
    const failures: Failure[] = [];
    for (const [i, pdf] of pdfs.entries()) {
      setReading({ status: "reading", done: i, total: pdfs.length });
      try {
        const r = parsePurchaseOrder(pdf.name, await extractPdfItemsInBrowser(pdf.data));
        if (r.ok) byNumber.set(r.order.number, r.order);
        else failures.push({ fileName: pdf.name, error: r.error });
      } catch {
        failures.push({ fileName: pdf.name, error: "PDF illisible" });
      }
    }
    const orders = [...byNumber.values()].sort(
      (a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.number.localeCompare(b.number),
    );
    setReading({ status: "ready", orders, failures, ignored });
  };

  const save = async (orders: ParsedPurchaseOrder[]) => {
    const total = {
      orders: 0,
      replaced: 0,
      lines: 0,
      createdMaterials: 0,
      newPrices: 0,
      newSuppliers: 0,
      outsideCalendar: 0,
    };
    const skipped: { fileName: string; reason: string }[] = [];
    for (let i = 0; i < orders.length; i += BATCH) {
      setSaving({ status: "saving", done: i, total: orders.length });
      const r = await savePurchaseOrdersAction(orders.slice(i, i + BATCH));
      if (!r.ok) {
        setSaving({
          status: "error",
          message: `${r.error}${i ? ` (${plural(i, "bon déjà enregistré", "bons déjà enregistrés")})` : ""}`,
        });
        return;
      }
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r.result[k];
      skipped.push(...r.result.skipped);
    }
    const details = [
      plural(total.orders, "bon", "bons"),
      total.replaced ? `${total.replaced} remplacé${total.replaced > 1 ? "s" : ""}` : null,
      plural(total.lines, "ligne", "lignes"),
      `${plural(total.newSuppliers, "fournisseur ajouté", "fournisseurs ajoutés")}`,
      `${plural(total.createdMaterials, "matière ajoutée", "matières ajoutées")}`,
      `${plural(total.newPrices, "prix d'achat enregistré", "prix d'achat enregistrés")}`,
      total.outsideCalendar
        ? `${plural(total.outsideCalendar, "bon hors du calendrier de production", "bons hors du calendrier de production")}`
        : null,
      skipped.length
        ? `${plural(skipped.length, "bon écarté", "bons écartés")} (${skipped.map((s) => `${s.fileName} : ${s.reason}`).join(" ; ")})`
        : null,
    ].filter(Boolean);
    setSaving({ status: "done", message: `Enregistré : ${details.join(" · ")}.` });
    setReading({ status: "idle" });
    router.refresh();
  };

  const ready = reading.status === "ready" ? reading : null;
  const suppliers = ready
    ? [...groupBySupplier(ready.orders)].map(([name, list]) => ({
        name,
        orders: list.length,
        lines: list.reduce((n, o) => n + o.lines.length, 0),
        from: list[0]!.deliveryDate,
        to: list.at(-1)!.deliveryDate,
        total: list.reduce((n, o) => n + (o.totalEur ?? 0), 0),
      }))
    : [];
  const warned = ready?.orders.filter((o) => o.warnings.length) ?? [];

  return (
    <section className="flex flex-col gap-3">
      <input
        type="file"
        multiple
        accept=".pdf,.zip,application/pdf,application/zip"
        onChange={(e) => onFiles(e.target.files)}
        className="text-base"
        aria-label="Bons de commande (PDF ou ZIP)"
        disabled={reading.status === "reading" || saving.status === "saving"}
      />
      {reading.status === "reading" && (
        <p className="text-slate-600" role="status">
          Lecture des bons… {reading.done} / {reading.total}
        </p>
      )}
      {ready && (
        <>
          <p className="text-slate-700">
            <span className="font-semibold">
              {plural(ready.orders.length, "bon de commande lu", "bons de commande lus")}
            </span>
            {ready.ignored > 0 &&
              ` · ${plural(ready.ignored, "fichier ignoré (pas un PDF)", "fichiers ignorés (pas des PDF)")}`}
          </p>
          {ready.failures.length > 0 && (
            <details className="rounded-xl bg-red-50 p-3 text-red-900">
              <summary className="cursor-pointer font-medium">
                {plural(ready.failures.length, "PDF non lu", "PDF non lus")}
              </summary>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {ready.failures.map((f) => (
                  <li key={f.fileName}>
                    {f.fileName} : {f.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {warned.length > 0 && (
            <details className="rounded-xl bg-amber-50 p-3 text-amber-950">
              <summary className="cursor-pointer font-medium">
                {plural(warned.length, "bon à vérifier", "bons à vérifier")}
              </summary>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {warned.map((o) => (
                  <li key={o.number}>
                    {o.fileName} : {o.warnings.join(" ; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {suppliers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Bons lus par fournisseur</caption>
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-1 font-medium">Fournisseur</th>
                    <th className="py-1 text-right font-medium">Bons</th>
                    <th className="py-1 text-right font-medium">Lignes</th>
                    <th className="py-1 font-medium">Livraisons</th>
                    <th className="py-1 text-right font-medium">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((x) => (
                    <tr key={x.name} className="border-t border-slate-100">
                      <td className="py-1">{x.name}</td>
                      <td className="py-1 text-right tabular-nums">{x.orders}</td>
                      <td className="py-1 text-right tabular-nums">{x.lines}</td>
                      <td className="py-1">
                        {x.from === x.to ? shortDate(x.from) : `${shortDate(x.from)} → ${shortDate(x.to)}`}
                      </td>
                      <td className="py-1 text-right tabular-nums">{euro.format(x.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!ready.orders.length || saving.status === "saving"}
            onClick={() => save(ready.orders)}
          >
            Enregistrer {plural(ready.orders.length, "bon", "bons")}
          </button>
        </>
      )}
      {saving.status === "saving" && (
        <p className="text-slate-600" role="status">
          Enregistrement… {saving.done} / {saving.total}
        </p>
      )}
      {saving.status === "done" && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
          {saving.message}
        </p>
      )}
      {saving.status === "error" && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {saving.message}
        </p>
      )}
    </section>
  );
}
