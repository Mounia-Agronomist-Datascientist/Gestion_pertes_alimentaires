import Link from "next/link";
import { db } from "@/db/client";
import { productLabel } from "@/domain/produits";
import { addDays, formatProductionWeek, toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { listDeclarations } from "@/modules/declarations/queries";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";
import { fmtDay, fmtQuantity, STATUS_LABELS, STATUS_STYLES } from "./format";

export const metadata = { title: "Historique — Pertes" };

type Params = Promise<{ periode?: string; annulees?: string }>;

export default async function HistoryPage({ searchParams }: { searchParams: Params }) {
  const user = await requireUser();
  const params = await searchParams;
  const today = toProductionLocalDate(new Date());
  const current = await findStoredProductionWeek(db, today);
  const previous = current ? await findStoredProductionWeek(db, addDays(current.startDate, -1)) : null;

  const periode = params.periode ?? "semaine";
  const week = periode === "semaine" ? current : periode === "precedente" ? previous : null;
  const includeCancelled = params.annulees === "1";
  const rows = await listDeclarations(db, user, { productionWeekId: week?.id, includeCancelled });

  const link = (p: Record<string, string>) =>
    `/historique?${new URLSearchParams({ periode, ...(includeCancelled ? { annulees: "1" } : {}), ...p })}`;
  const chip = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-teal-700 text-white" : "bg-white text-slate-700 shadow-sm"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-xl px-2 py-2 font-medium text-slate-700">
          ← Accueil
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Pertes déclarées</h1>

      <nav aria-label="Période" className="flex flex-wrap gap-2">
        <Link className={chip(periode === "semaine")} href={link({ periode: "semaine" })}>
          {current ? `Cette semaine (${formatProductionWeek(current)})` : "Cette semaine"}
        </Link>
        <Link className={chip(periode === "precedente")} href={link({ periode: "precedente" })}>
          {previous ? `Semaine précédente (${formatProductionWeek(previous)})` : "Semaine précédente"}
        </Link>
        <Link className={chip(periode === "toutes")} href={link({ periode: "toutes" })}>
          Toutes
        </Link>
        <Link
          className={chip(includeCancelled)}
          href={`/historique?${new URLSearchParams({ periode, ...(includeCancelled ? {} : { annulees: "1" }) })}`}
        >
          {includeCancelled ? "Masquer les annulées" : "Voir les annulées"}
        </Link>
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600">Aucune perte déclarée pour cette période.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((d) => (
            <li key={d.id}>
              <Link href={`/historique/${d.id}`} className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold">
                    {productLabel(d.productName, d.productCode)}
                    {d.productUnlisted && <span className="text-sm font-normal text-amber-700"> (hors liste)</span>}
                  </span>
                  <span className="whitespace-nowrap font-semibold">{fmtQuantity(d.netQuantity, d.netUnitCode, d.netKg)}</span>
                </span>
                <span className="text-sm text-slate-600">{d.causeName}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span>{fmtDay(d.occurredOn)}</span>
                  <span>·</span>
                  <span>
                    {d.zoneName} › {d.subzoneName}
                  </span>
                  {d.teamLetter && (
                    <span className="rounded-full px-2 text-white" style={{ backgroundColor: d.teamColorHex ?? undefined }}>
                      Équipe {d.teamLetter}
                    </span>
                  )}
                  {d.status !== "validee" && <span className={`rounded-full px-2 ${STATUS_STYLES[d.status]}`}>{STATUS_LABELS[d.status]}</span>}
                  {d.isLate && <span className="rounded-full bg-amber-50 px-2 text-amber-800">Tardive</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 200 && <p className="text-sm text-slate-500">Seules les 200 dernières pertes sont affichées.</p>}
    </div>
  );
}
