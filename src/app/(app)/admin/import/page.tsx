import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { listWeekImports } from "@/modules/imports/service";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import de la semaine — Administration" };

const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function ImportPage() {
  const admin = await requireUser();
  const imports = await listWeekImports(db, admin);
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
    </>
  );
}
