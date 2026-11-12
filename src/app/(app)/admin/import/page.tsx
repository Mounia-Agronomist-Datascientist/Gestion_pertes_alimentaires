import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { alchimistesCoverage, listAlchimistesImports } from "@/modules/imports/alchimistes/service";
import { listProductionCounts } from "@/modules/imports/decompte/service";
import { listWeekImports } from "@/modules/imports/service";
import { AlchimistesWizard } from "./alchimistes-wizard";
import { DecompteWizard } from "./decompte-wizard";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import de la semaine — Administration" };

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function ImportPage() {
  const admin = await requireUser();
  const [imports, counts, alchimistes, coverage] = await Promise.all([
    listWeekImports(db, admin),
    listProductionCounts(db, admin),
    listAlchimistesImports(db, admin),
    alchimistesCoverage(db, admin),
  ]);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Import de la semaine</h1>
      <p className="text-sm text-slate-600">
        Chaque mardi : déposez le tome Melba (PDF « Imprimer les recettes ») et le plan de production (Google Sheets →
        Fichier → Télécharger → Microsoft Excel). Les fichiers sont lus sur cet ordinateur et ne sont pas envoyés :
        seules les données de la semaine sont enregistrées, après votre validation.
      </p>
      <ImportWizard
        existing={imports
          .filter((i) => i.status === "validee")
          .map((i) => ({ year: i.weekYear, week: i.weekNumber, version: i.version }))}
      />

      <DecompteWizard
        existing={counts.filter((c) => c.status === "validee").map((c) => ({ year: c.weekYear, week: c.weekNumber, version: c.version }))}
      />

      <AlchimistesWizard coverage={coverage} />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Imports enregistrés</h2>
        {imports.length === 0 && <p className="text-slate-600">Aucun import pour l&apos;instant.</p>}
        <ul className="flex flex-col gap-2">
          {imports.map((i) => (
            <li key={i.id} className={`rounded-2xl bg-white p-4 shadow-sm ${i.status === "remplacee" ? "opacity-60" : ""}`}>
              <span className="font-semibold">
                S{i.weekNumber}-{i.weekYear} · version {i.version}
              </span>
              <span className={`ml-2 rounded-full px-2 text-sm ${i.status === "validee" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200"}`}>
                {i.status === "validee" ? "En vigueur" : "Remplacée"}
              </span>
              <span className="block text-sm text-slate-600">
                {dateTimeFormat.format(i.createdAt)} par {i.createdByName} · {i.tomeFileName} · onglet {i.planSheetName}
                {i.anomalies.length > 0 && ` · ${i.anomalies.length} point${i.anomalies.length > 1 ? "s" : ""} à vérifier`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Décomptes enregistrés</h2>
        {counts.length === 0 && <p className="text-slate-600">Aucun décompte pour l&apos;instant.</p>}
        <ul className="flex flex-col gap-2">
          {counts.map((c) => (
            <li key={c.id} className={`rounded-2xl bg-white p-4 shadow-sm ${c.status === "remplacee" ? "opacity-60" : ""}`}>
              <span className="font-semibold">
                S{c.weekNumber}-{c.weekYear} · version {c.version}
              </span>
              <span className={`ml-2 rounded-full px-2 text-sm ${c.status === "validee" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200"}`}>
                {c.status === "validee" ? "En vigueur" : "Remplacé"}
              </span>
              <span className="block text-sm text-slate-600">
                {dateTimeFormat.format(c.createdAt)} par {c.createdByName} · {c.fileName} · onglet {c.sheetName}
                {c.anomalies.length > 0 && ` · ${c.anomalies.length} point${c.anomalies.length > 1 ? "s" : ""} à vérifier`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Pesées des Alchimistes enregistrées</h2>
        {alchimistes.length === 0 && <p className="text-slate-600">Aucun fichier pour l&apos;instant.</p>}
        <ul className="flex flex-col gap-2">
          {alchimistes.map((a) => (
            <li key={a.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <span className="font-semibold">
                Du {shortDate(a.periodFrom)} au {shortDate(a.periodTo)} · {a.collections} collectes · {a.totalKg.toLocaleString("fr-FR")} kg
              </span>
              <span className="block text-sm text-slate-600">
                {dateTimeFormat.format(a.createdAt)} par {a.createdByName} · {a.fileName}
                {a.anomalies.length > 0 && ` · ${a.anomalies.length} point${a.anomalies.length > 1 ? "s" : ""} à vérifier`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">Un fichier plus récent remplace les collectes de sa période ; les anciennes restent conservées.</p>
      </section>
    </>
  );
}
