import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { alchimistesCoverage, listAlchimistesImports } from "@/modules/imports/alchimistes/service";
import { listProductionCounts } from "@/modules/imports/decompte/service";
import { listSurplusImports, SURPLUS_SOURCE_LABELS, surplusCoverage } from "@/modules/imports/surplus/service";
import { listWeekImports } from "@/modules/imports/service";
import { purchaseOrdersOverview } from "@/modules/matieres/bons-commande";
import { AlchimistesWizard } from "./alchimistes-wizard";
import { DecompteWizard } from "./decompte-wizard";
import { ImportWizard } from "./import-wizard";
import { PurchaseOrdersWizard } from "./purchase-orders-wizard";
import { SurplusWizard } from "./surplus-wizard";
import { DayHeader, DocumentIntro, WeekLegend, weeksAround } from "./import-steps";
import { toProductionLocalDate } from "@/domain/semaine-production";

export const metadata = { title: "Import de la semaine — Administration" };

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export default async function ImportPage() {
  const admin = await requireUser();
  const [imports, counts, alchimistes, coverage, surplus, surplusCovered, purchases] = await Promise.all([
    listWeekImports(db, admin),
    listProductionCounts(db, admin),
    listAlchimistesImports(db, admin),
    alchimistesCoverage(db, admin),
    listSurplusImports(db, admin),
    surplusCoverage(db, admin),
    purchaseOrdersOverview(db, admin),
  ]);
  const weeks = weeksAround(toProductionLocalDate(new Date()));
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Import de la semaine</h1>
      <nav aria-label="Jours" className="flex flex-wrap gap-2">
        {[
          ["#mardi", "Mardi"],
          ["#jeudi", "Jeudi"],
          ["#historique", "Fichiers déjà déposés"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-brun-700 shadow-sm"
          >
            {label}
          </a>
        ))}
      </nav>
      <WeekLegend weeks={weeks} />

      <DayHeader id="mardi" day="Mardi" text="Préparer la semaine qui commence jeudi (S+1)" />
      <DocumentIntro
        title="Tome Melba et plan de production"
        offset={1}
        weeks={weeks}
        what="le tome Melba (PDF « Imprimer les recettes » : recettes, sous-recettes, ingrédients, poids et coûts) et le plan de production (Google Sheets → Fichier → Télécharger → Microsoft Excel : plats et barquettes de chaque équipe)."
        usedFor={[
          "Proposer à chaque équipe les plats de sa semaine, leurs sous-recettes et leurs ingrédients à la saisie (sans import, les équipes ne voient pas les plats).",
          "Chiffrer les pertes avec les coûts du tome de la semaine.",
          "Donner la production prévue (barquettes) pour les ratios et la comparaison à volume égal.",
          "Compléter la liste des matières premières et leurs prix.",
        ]}
      />
      <ImportWizard
        existing={imports
          .filter((i) => i.status === "validee")
          .map((i) => ({ year: i.weekYear, week: i.weekNumber, version: i.version }))}
      />

      <DayHeader
        id="jeudi"
        day="Jeudi"
        text="Une nouvelle semaine commence : clore la semaine terminée (S-1), puis préparer les achats de S+1"
      />
      <DocumentIntro
        title="Barquettes réellement produites"
        offset={-1}
        weeks={weeks}
        what="le Google Sheets « Décompte barquettes » (Fichier → Télécharger → Microsoft Excel) ; seule la colonne « Ma production » de l'onglet « Semaine NN » est lue."
        usedFor={[
          "Donner la production réelle de chaque équipe : ratios de pertes sur le réel, à côté du prévu (onglet « Ratios »).",
          "Comparer les semaines à volume égal (onglet « Évolution », synthèse).",
        ]}
        notes="les onglets des jours (noms des opérateurs) ne sont jamais lus ; un décompte redéposé pour la même semaine la remplace."
      >
        <DecompteWizard
          existing={counts
            .filter((c) => c.status === "validee")
            .map((c) => ({ year: c.weekYear, week: c.weekNumber, version: c.version }))}
        />
      </DocumentIntro>
      <DocumentIntro
        title="Pesées des Alchimistes"
        offset={-1}
        weeks={weeks}
        weekNote="et les semaines d'avant si le fichier les contient"
        what="l'export CSV ou Excel des collectes des Alchimistes (date, poids, bac) ; le nom du client n'est pas lu."
        usedFor={[
          "Comparer les kg déclarés « Les Alchimistes – compost » aux kg réellement pesés par Les Alchimistes (onglet « Alchimistes »).",
          "Alimenter le rapport environnemental.",
        ]}
        notes="la semaine de production est calculée à partir de la date de collecte ; ces poids servent au contrôle et ne s’ajoutent jamais aux pertes déclarées ; un fichier plus récent remplace les collectes de sa période."
      >
        <AlchimistesWizard coverage={coverage} />
      </DocumentIntro>
      <DocumentIntro
        title="Ventes et dons des surplus"
        offset={-1}
        weeks={weeks}
        weekNote="et les semaines d'avant si le fichier les contient"
        what="les Google Sheets « VENTES TGTG », « VENTES FLASH » et « Gestion des surplus barquettes pour association Linkee » (Fichier → Télécharger → Microsoft Excel)."
        usedFor={[
          "Compter les barquettes vendues (Too Good To Go, vente flash) ou données (Linkee) : les équipes ne les déclarent pas.",
          "Donner les recettes encaissées et la part récupérée (onglet « Valorisation », coût net, rapport de valorisation).",
        ]}
        notes="le type de fichier est reconnu tout seul ; les contacts du fichier Linkee ne sont pas lus ; un fichier plus récent remplace sa période."
      >
        <SurplusWizard coverage={surplusCovered} />
      </DocumentIntro>
      <DocumentIntro
        title="Bons de commande fournisseurs"
        offset={1}
        weeks={weeks}
        what="les bons de commande Melba en PDF (ou le dossier du Drive téléchargé en ZIP pour reprendre l'historique)."
        usedFor={[
          "Enregistrer les fournisseurs, les colis (« sachet de 2 kg ») et les prix d'achat datés des matières.",
          "Proposer en Réception les matières commandées (S-1, S et S+1) avec leur fournisseur et leur colis.",
          "Préparer le recoupement avec le tome et la liste des matières à compléter.",
        ]}
        notes="les adresses e-mail ne sont jamais lues ; un bon déjà déposé est remplacé."
      >
        <PurchaseOrdersWizard />
      </DocumentIntro>
      {purchases.bySupplier.length > 0 && (
        <details className="rounded-2xl bg-white p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold">
            Bons de commande enregistrés : {purchases.bySupplier.reduce((n, x) => n + x.orders, 0)} bons,{" "}
            {purchases.bySupplier.length} fournisseurs, {purchases.orderedMaterials} matières commandées
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {purchases.bySupplier.map((x) => (
              <li key={x.supplier}>
                <span className="font-medium">{x.supplier}</span> · {x.orders} bon{x.orders > 1 && "s"} · livraisons du{" "}
                {shortDate(x.from)} au {shortDate(x.to)}
              </li>
            ))}
          </ul>
          <h3 className="mt-3 font-medium">Derniers déposés</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {purchases.recent.map((o) => (
              <li key={o.id}>
                {o.supplier} · n° {o.number} · {o.subject ?? (o.weekNumber ? `S${o.weekNumber}` : "")} · livraison{" "}
                {shortDate(o.deliveryDate)} · {o.lines} ligne
                {o.lines > 1 && "s"}
                {o.version > 1 && ` · version ${o.version}`}
                {o.warnings.length > 0 && ` · ${o.warnings.length} point${o.warnings.length > 1 ? "s" : ""} à vérifier`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
        Ensuite, toujours le jeudi :{" "}
        <Link href="/admin/recoupement" className="font-medium underline">
          Recoupement de la semaine
        </Link>{" "}
        (tome face aux bons) et{" "}
        <Link href="/admin/produits/a-completer" className="font-medium underline">
          Matières à compléter
        </Link>
        .
      </p>

      <DayHeader
        id="historique"
        day="Fichiers déjà déposés"
        text="Du plus récent au plus ancien, par type de document"
      />
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Tome Melba et plan de production</h3>
        {imports.length === 0 && <p className="text-slate-600">Aucun import pour l&apos;instant.</p>}
        <ul className="flex flex-col gap-2">
          {imports.map((i) => (
            <li
              key={i.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${i.status === "remplacee" ? "opacity-60" : ""}`}
            >
              <span className="font-semibold">
                S{i.weekNumber}-{i.weekYear} · version {i.version}
              </span>
              <span
                className={`ml-2 rounded-full px-2 text-sm ${i.status === "validee" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200"}`}
              >
                {i.status === "validee" ? "En vigueur" : "Remplacée"}
              </span>
              <span className="block text-sm text-slate-600">
                {dateTimeFormat.format(i.createdAt)} par {i.createdByName} · {i.tomeFileName} · onglet {i.planSheetName}
                {i.anomalies.length > 0 &&
                  ` · ${i.anomalies.length} point${i.anomalies.length > 1 ? "s" : ""} à vérifier`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Barquettes réellement produites</h3>
        {counts.length === 0 && <p className="text-slate-600">Aucun décompte pour l&apos;instant.</p>}
        <ul className="flex flex-col gap-2">
          {counts.map((c) => (
            <li
              key={c.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${c.status === "remplacee" ? "opacity-60" : ""}`}
            >
              <span className="font-semibold">
                S{c.weekNumber}-{c.weekYear} · version {c.version}
              </span>
              <span
                className={`ml-2 rounded-full px-2 text-sm ${c.status === "validee" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200"}`}
              >
                {c.status === "validee" ? "En vigueur" : "Remplacé"}
              </span>
              <span className="block text-sm text-slate-600">
                {dateTimeFormat.format(c.createdAt)} par {c.createdByName} · {c.fileName} · onglet {c.sheetName}
                {c.anomalies.length > 0 &&
                  ` · ${c.anomalies.length} point${c.anomalies.length > 1 ? "s" : ""} à vérifier`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Pesées des Alchimistes</h3>
        {alchimistes.length === 0 && <p className="text-slate-600">Aucun fichier pour l&apos;instant.</p>}
        <ul className="flex flex-col gap-2">
          {alchimistes.map((a) => (
            <li key={a.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <span className="font-semibold">
                Du {shortDate(a.periodFrom)} au {shortDate(a.periodTo)} · {a.collections} collectes ·{" "}
                {a.totalKg.toLocaleString("fr-FR")} kg
              </span>
              <span className="block text-sm text-slate-600">
                {dateTimeFormat.format(a.createdAt)} par {a.createdByName} · {a.fileName}
                {a.anomalies.length > 0 &&
                  ` · ${a.anomalies.length} point${a.anomalies.length > 1 ? "s" : ""} à vérifier`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          Un fichier plus récent remplace les collectes de sa période ; les anciennes restent conservées.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Ventes et dons des surplus</h3>
        {surplus.length === 0 && <p className="text-slate-600">Aucun fichier pour l&apos;instant.</p>}
        <ul className="flex flex-col gap-2">
          {surplus.map((f) => (
            <li key={f.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <span className="font-semibold">
                {SURPLUS_SOURCE_LABELS[f.source]} · du {shortDate(f.periodFrom)} au {shortDate(f.periodTo)} ·{" "}
                {f.entries} lignes
              </span>
              <span className="block text-sm text-slate-600">
                {dateTimeFormat.format(f.createdAt)} par {f.createdByName} · {f.fileName} · {f.sheets}
                {f.anomalies.length > 0 &&
                  ` · ${f.anomalies.length} point${f.anomalies.length > 1 ? "s" : ""} à vérifier`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          Un fichier plus récent remplace les lignes de sa source sur sa période ; les anciennes restent conservées.
        </p>
      </section>
    </>
  );
}
