"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type ProductSheetState, supplierAction } from "../actions";

interface Supplier {
  id: string;
  name: string;
  orders: number;
  materials: number;
  lastDelivery: string | null;
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDay = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`));

export function SuppliersList({ suppliers }: { suppliers: Supplier[] }) {
  const [state, action, pending] = useActionState<ProductSheetState, FormData>(supplierAction, {});
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
          {state.message}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {suppliers.map((x) => (
          <li key={x.id} className="flex flex-col gap-1 rounded-2xl bg-white p-4 shadow-sm">
            {editing === x.id ? (
              <form action={action} className="flex flex-col gap-2 sm:flex-row" onSubmit={() => setEditing(null)}>
                <input type="hidden" name="supplierId" value={x.id} />
                <input name="name" defaultValue={x.name} className="field min-w-0 flex-1" required minLength={2} aria-label="Nom du fournisseur" />
                <div className="flex gap-2">
                  <button type="submit" disabled={pending} className="btn-primary">
                    Enregistrer
                  </button>
                  <button type="button" className="px-4 text-slate-700" onClick={() => setEditing(null)}>
                    Fermer
                  </button>
                </div>
              </form>
            ) : (
              <>
                <span className="font-semibold">{x.name}</span>
                <span className="text-sm text-slate-600">
                  {x.orders} bon{x.orders > 1 ? "s" : ""} · {x.materials} matière{x.materials > 1 ? "s" : ""}
                  {x.lastDelivery && ` · dernière livraison le ${fmtDay(x.lastDelivery)}`}
                </span>
                <div className="flex flex-wrap gap-4">
                  <Link href={`/admin/produits?fournisseur=${x.id}`} className="text-sm font-medium text-teal-800 underline">
                    Voir ses matières
                  </Link>
                  <button type="button" className="text-sm font-medium text-teal-800 underline" onClick={() => setEditing(x.id)}>
                    Renommer
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
