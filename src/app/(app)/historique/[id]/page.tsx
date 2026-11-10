import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { formatProductionWeek } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { PRODUCT_CATEGORY_LABELS } from "@/modules/declarations/input";
import { getDeclarationDetail } from "@/modules/declarations/queries";
import { fmtDateTime, fmtDay, fmtNumber, fmtQuantity, STATUS_LABELS, STATUS_STYLES, UNIT_LABELS } from "../format";
import { CancelForm } from "./cancel-form";

const euroFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const fmtEuro = (n: number) => euroFormat.format(n);

export const metadata = { title: "Détail d'une perte — Pertes" };

/** Champs comparés d'une version à l'autre pour indiquer ce qui a changé. */
const TRACKED_FIELDS: Record<string, string> = {
  occurredOn: "date",
  subzoneId: "lieu",
  teamId: "équipe",
  productName: "produit",
  netQuantity: "quantité",
  netUnitCode: "unité",
  tareTotalKg: "tare",
  causeName: "cause",
  comment: "commentaire",
};

type Snapshot = { declaration: Record<string, unknown>; destinations?: { destinationId: string; quantity: number }[] };

function changedFields(current: Snapshot, previous: Snapshot | undefined): string[] {
  if (!previous) return [];
  const labels = Object.entries(TRACKED_FIELDS)
    .filter(([key]) => JSON.stringify(current.declaration[key]) !== JSON.stringify(previous.declaration[key]))
    .map(([, label]) => label);
  const dest = (s: Snapshot) => JSON.stringify((s.destinations ?? []).map((d) => [d.destinationId, d.quantity]).sort());
  if (dest(current) !== dest(previous)) labels.push("destinations");
  return [...new Set(labels)];
}

export default async function DeclarationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ annulee?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { annulee } = await searchParams;
  const detail = await getDeclarationDetail(db, user, id).catch(() => null);
  if (!detail) notFound();
  const d = detail.declaration;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/historique" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Historique
      </Link>
      {annulee && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
          Déclaration annulée. Elle reste visible ici avec son historique.
        </p>
      )}

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{d.productName}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[d.status]}`}>{STATUS_LABELS[d.status]}</span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl bg-white p-4">
        <dt className="text-slate-500">Quantité</dt>
        <dd className="font-semibold">
          {fmtQuantity(d.netQuantity, d.netUnitCode, d.netKg)}
          {d.kgStatus === "non_converti" && <span className="block text-sm font-normal text-amber-700">Non convertie en kg</span>}
        </dd>
        {d.tareTotalKg != null && (
          <>
            <dt className="text-slate-500">Pesée</dt>
            <dd>
              Brut {fmtNumber(d.quantity)} kg − tare {fmtNumber(d.tareTotalKg)} kg
              <ul className="text-sm text-slate-600">
                {detail.containers.map((c) => (
                  <li key={c.containerTypeId}>
                    {c.kind === "gastro" ? `${c.count} × ${c.name}` : c.name} : {fmtNumber(c.tareKg)} kg
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <dt className="text-slate-500">Produit</dt>
        <dd>
          {d.productName} <span className="text-sm text-slate-500">({PRODUCT_CATEGORY_LABELS[d.productCategory]})</span>
          {d.productUnlisted && <span className="block text-sm text-amber-700">Hors liste : à rattacher au référentiel</span>}
        </dd>
        {d.costImportId && (
          <>
            <dt className="text-slate-500">Coût matière</dt>
            <dd>
              {d.materialCostEur != null ? `≈ ${fmtEuro(d.materialCostEur)}` : "non calculable"}
              <span className="block text-sm text-slate-500">
                Coût du tome Melba de la semaine
                {d.costPerUnitEur != null && ` · ${fmtEuro(d.costPerUnitEur)} l'unité`}
                {d.costPerKgEur != null && ` · ${fmtEuro(d.costPerKgEur)} le kg`}
              </span>
            </dd>
          </>
        )}
        <dt className="text-slate-500">Cause</dt>
        <dd>{d.causeName}</dd>
        <dt className="text-slate-500">Destination</dt>
        <dd>
          <ul>
            {detail.destinations.map((x) => (
              <li key={x.destinationId}>
                {x.name} : {fmtNumber(x.quantity)} {UNIT_LABELS[d.netUnitCode] ?? d.netUnitCode}
              </li>
            ))}
          </ul>
          {d.destinationGapJustification && (
            <span className="block text-sm text-amber-700">Écart justifié : {d.destinationGapJustification}</span>
          )}
        </dd>
        <dt className="text-slate-500">Lieu</dt>
        <dd>
          {detail.zoneName} › {detail.subzoneName}
        </dd>
        <dt className="text-slate-500">Responsable</dt>
        <dd>{detail.teamLetter ? `Équipe ${detail.teamLetter} – ${detail.teamColorName}` : `Responsable de zone (${detail.zoneName})`}</dd>
        <dt className="text-slate-500">Date</dt>
        <dd>
          {fmtDay(d.occurredOn)}
          {d.occurredTime && ` à ${d.occurredTime.slice(0, 5)}`} — {formatProductionWeek(detail.productionWeek)}
          {d.isLate && <span className="block text-sm text-amber-700">Déclaration tardive</span>}
        </dd>
        <dt className="text-slate-500">Saisie</dt>
        <dd>
          {fmtDateTime(d.declaredAt)} par {detail.authorName}
          <span className={`block text-sm ${detail.delayDays > 0 ? "text-amber-700" : "text-slate-500"}`}>
            {detail.delayDays === 0
              ? "Saisie le jour même"
              : `Saisie ${detail.delayDays} jour${detail.delayDays > 1 ? "s" : ""} après la perte`}
          </span>
        </dd>
        {d.comment && (
          <>
            <dt className="text-slate-500">Commentaire</dt>
            <dd>{d.comment}</dd>
          </>
        )}
      </dl>

      {detail.canModify && (
        <div className="flex flex-col gap-3">
          <Link href={`/historique/${d.id}/corriger`} className="btn-primary flex items-center justify-center">
            Corriger
          </Link>
          <CancelForm id={d.id} revision={d.revision} />
        </div>
      )}
      {!detail.canModify && d.status !== "annulee" && (
        <p className="text-sm text-slate-500">La période de correction est terminée : demandez à un responsable.</p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Historique des versions</h2>
        <ol className="flex flex-col gap-2">
          {detail.revisions.map((r, i) => {
            const data = r.data as Snapshot;
            const changes = changedFields(data, detail.revisions[i + 1]?.data as Snapshot | undefined);
            return (
              <li key={r.revision} className="rounded-2xl bg-white p-3 text-sm">
                <p className="font-medium">
                  Version {r.revision} — {STATUS_LABELS[r.status]} le {fmtDateTime(r.changedAt)} par {r.changedByName}
                </p>
                {r.reason && <p>Motif : {r.reason}</p>}
                {changes.length > 0 && <p className="text-slate-600">Modifié : {changes.join(", ")}</p>}
                <p className="text-slate-500">
                  {String(data.declaration.productName)} ·{" "}
                  {fmtQuantity(
                    Number(data.declaration.netQuantity),
                    String(data.declaration.netUnitCode),
                    data.declaration.netKg == null ? null : Number(data.declaration.netKg),
                  )}{" "}
                  · {String(data.declaration.causeName)}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
