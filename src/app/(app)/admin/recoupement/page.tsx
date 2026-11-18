import Link from "next/link";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/next-session";
import { reconciliationWeeks, weekReconciliation } from "@/modules/matieres/recoupement";

export const metadata = { title: "Recoupement de la semaine — Administration" };

const fmtEur = (n: number) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 0.1 ? 4 : 2,
  });
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`;
const fmtQty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Recoupement de la semaine (docs/PHASE6.md, étape 6.9) : ingrédients du tome en vigueur face aux bons de commande
 * déposés pour la même semaine de production.
 */
export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const admin = await requireUser();
  const { semaine } = await searchParams;
  const weeks = await reconciliationWeeks(db, admin);
  // Par défaut : la semaine la plus récente qui a son tome et ses bons (le tome arrive le mardi, les bons le jeudi).
  const selected =
    weeks.find((w) => w.id === semaine) ??
    weeks.find((w) => w.hasTome && w.orders > 0) ??
    weeks.find((w) => w.orders > 0) ??
    weeks[0];
  const r = selected ? await weekReconciliation(db, admin, selected.id) : null;

  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Recoupement de la semaine</h1>
      <p className="text-slate-600">
        Les ingrédients du tome face aux bons de commande de la même semaine de production. Les bons de la semaine
        suivante arrivent au plus tôt le jeudi : déposez-les dans{" "}
        <Link href="/admin/import" className="text-teal-800 underline">
          Import
        </Link>
        .
      </p>

      {!selected || !r ? (
        <p className="rounded-2xl bg-white p-4 shadow-sm">
          Aucune semaine à recouper : importez un tome ou déposez des bons de commande.
        </p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4 shadow-sm">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Semaine de production</span>
              <select
                name="semaine"
                defaultValue={selected.id}
                className="w-full min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-base"
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    S{String(w.number).padStart(2, "0")}-{w.year} · {shortDate(w.startDate)} ·{" "}
                    {[w.hasTome ? "tome" : "sans tome", w.orders ? plural(w.orders, "bon", "bons") : "aucun bon"].join(
                      ", ",
                    )}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-secondary">
              Afficher
            </button>
          </form>

          <section aria-label="Résumé" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile value={r.matched} label={`ingrédients du tome commandés, sur ${r.tomeIngredients}`} />
            <Tile value={r.withoutOrder.length} label="ingrédients sans commande cette semaine" />
            <Tile value={r.notInTome.length} label={`lignes de bon absentes du tome, sur ${r.orderLines}`} />
            <Tile value={r.priceGaps.length} label="écarts de prix tome / bon" />
          </section>

          {!r.hasTome && (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-950">
              Le tome de {r.week.label} n&apos;est pas encore importé : toutes les lignes des bons apparaissent comme
              absentes du tome.
            </p>
          )}
          {r.orders === 0 && (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-950">
              Aucun bon de commande déposé pour {r.week.label} : tous les ingrédients du tome apparaissent sans
              commande.
            </p>
          )}

          <Section title="Écarts de prix entre le tome et le bon" count={r.priceGaps.length} open>
            <p className="text-sm text-slate-600">
              Prix du tome de la semaine face au prix d&apos;achat du bon (la dernière livraison s&apos;il y en a
              plusieurs), du plus grand écart au plus petit. Le coût du tome compte la préparation : une perte à
              l&apos;épluchage ou au parage le rend plus cher que le prix d&apos;achat, un féculent qui gonfle à la
              cuisson le rend moins cher. Un écart n&apos;est donc pas forcément un changement de prix. Les écarts de
              moins de 0,5 % (arrondi du tome) ne sont pas montrés
              {r.incomparable > 0 &&
                `, ni ${plural(r.incomparable, "matière dont les prix ne se comparent pas", "matières dont les prix ne se comparent pas")} (liquide sans densité, unités différentes)`}
              .
            </p>
            <Table head={["Matière", "Fournisseur", "Tome", "Bon", "Écart"]} right={[2, 3, 4]}>
              {r.priceGaps.map((g) => (
                <tr key={g.key} className="border-t border-slate-100">
                  <td className="py-1 pr-2">{g.name}</td>
                  <td className="py-1 pr-2">
                    {g.supplier} <span className="text-slate-500">· {shortDate(g.deliveryDate)}</span>
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {fmtEur(g.tomeEur)} / {g.basis === "kg" ? "kg" : "pièce"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {fmtEur(g.orderEur)} / {g.basis === "kg" ? "kg" : "pièce"}
                  </td>
                  <td className="py-1 text-right font-medium tabular-nums">{fmtPct(g.gap)}</td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Commandes absentes du tome" count={r.notInTome.length} open>
            <p className="text-sm text-slate-600">
              Lignes des bons de la semaine dont la désignation n&apos;est pas un ingrédient du tome de la semaine.
            </p>
            <Table head={["Fournisseur", "Désignation", "Quantité", "Total HT", "Cité dans le tome de"]} right={[2, 3]}>
              {r.notInTome.map((l) => (
                <tr key={`${l.orderNumber}-${l.designation}`} className="border-t border-slate-100">
                  <td className="py-1 pr-2">
                    {l.supplier} <span className="text-slate-500">· {shortDate(l.deliveryDate)}</span>
                  </td>
                  <td className="py-1 pr-2">{l.designation}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {fmtQty(l.quantity)} {l.packagingLabel ?? ""}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{l.totalEur != null ? fmtEur(l.totalEur) : "—"}</td>
                  <td className="py-1">
                    {l.otherTomes.length ? l.otherTomes.join(", ") : <span className="text-slate-500">aucun</span>}
                  </td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Ingrédients du tome sans commande cette semaine" count={r.withoutOrder.length}>
            <p className="text-sm text-slate-600">
              Ingrédients du tome qu&apos;aucun bon de la semaine ne commande : pris sur le stock, commandés autrement,
              ou bon pas encore déposé. La dernière commande déposée avant la semaine est indiquée.
            </p>
            <Table head={["Ingrédient", "Utilisé dans", "Dernière commande"]}>
              {r.withoutOrder.map((m) => (
                <tr key={m.key} className="border-t border-slate-100 align-top">
                  <td className="py-1 pr-2">{m.name}</td>
                  <td className="py-1 pr-2 text-slate-700">
                    {m.usedIn.slice(0, 2).join(" ; ")}
                    {m.usedIn.length > 2 && (
                      <span className="text-slate-500">
                        {" "}
                        et {m.usedIn.length - 2} autre{m.usedIn.length > 3 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-1">
                    {m.lastOrder ? (
                      `${m.lastOrder.supplier} · ${shortDate(m.lastOrder.deliveryDate)}`
                    ) : (
                      <span className="text-slate-500">aucune</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}

function Section({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count: number;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open && count > 0} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold">
        {title} ({count})
      </summary>
      {count === 0 ? (
        <p className="mt-2 text-slate-600">Rien à signaler.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">{children}</div>
      )}
    </details>
  );
}

function Table({ head, right = [], children }: { head: string[]; right?: number[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            {head.map((h, i) => (
              <th key={h} className={`py-1 pr-2 font-medium ${right.includes(i) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
