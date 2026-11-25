import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { missingCosts } from "@/modules/declarations/service";
import { CompleteButton } from "./complete-button";

export const metadata = { title: "Coûts manquants — Administration" };

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const date = (d: string) => d.split("-").reverse().join("/");
const UNITS: Record<string, string> = { piece: "pièce(s)", barquette: "barquette(s)", colis: "colis", l: "L" };

/**
 * Pertes enregistrées sans coût (décision du 26/11/2026) : celles qui se calculent aujourd'hui (prix arrivé depuis,
 * tome de la semaine importé) se complètent d'un clic, en nouvelle version ; les autres attendent un prix.
 */
export default async function MissingCostsPage() {
  const user = await requireUser();
  const list = await missingCosts(db, user);
  const ready = list.filter((d) => d.completedGrossEur != null);
  const waiting = list.filter((d) => d.completedGrossEur == null);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Coûts manquants</h1>
      <p className="text-sm text-slate-600">
        Pertes enregistrées sans coût connu. Quand un prix ou le tome de la semaine est arrivé depuis la saisie, le coût
        se calcule à la date de la perte : chaque perte complétée devient une nouvelle version (l&apos;ancienne reste
        dans l&apos;historique). Un coût n&apos;est jamais deviné.
      </p>
      <CompleteButton ready={ready.length} />
      {[
        { title: `Peuvent être complétées (${ready.length})`, rows: ready },
        { title: `Toujours sans prix (${waiting.length})`, rows: waiting },
      ].map(
        (group) =>
          group.rows.length > 0 && (
            <section key={group.title} className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm">
              <h2 className="font-semibold">{group.title}</h2>
              <ul className="flex flex-col divide-y divide-slate-100 text-sm">
                {group.rows.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                    <Link href={`/historique/${d.id}`} className="font-medium underline">
                      {d.productName}
                    </Link>
                    <span className="text-slate-600 tabular-nums">
                      {date(d.occurredOn)} · {num.format(d.quantity)} {UNITS[d.unitCode] ?? d.unitCode}
                      {d.netKg != null && d.unitCode !== "kg" ? ` (${num.format(d.netKg)} kg)` : ""}
                      {d.completedGrossEur != null && (
                        <strong className="text-slate-900"> → {euro.format(d.completedGrossEur)}</strong>
                      )}
                      {d.completedGrossEur == null && d.productUnlisted && " · hors liste : Administration → Produits"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </>
  );
}
