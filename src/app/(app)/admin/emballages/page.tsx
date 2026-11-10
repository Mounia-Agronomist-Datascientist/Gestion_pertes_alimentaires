import Link from "next/link";
import { db } from "@/db/client";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { listPackaging } from "@/modules/admin/packaging";
import { requireUser } from "@/modules/auth/next-session";
import { PackagingAdmin } from "./packaging-admin";

export const metadata = { title: "Emballages et consommables — Administration" };

export default async function PackagingPage() {
  const admin = await requireUser();
  const today = toProductionLocalDate(new Date());
  const { items, perPortion } = await listPackaging(db, admin, today);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Emballages et consommables</h1>
      <p className="text-sm text-slate-600">
        Coût unitaire daté de chaque emballage, et quantité consommée par portion : ces emballages sont ajoutés au coût
        de tout plat perdu (décision du 10/11/2026). Les moules et plats à gratin déjà comptés dans le coût Melba d&apos;un
        plat ne sont pas ajoutés une seconde fois. Sans coût saisi, rien n&apos;est compté.
      </p>
      <PackagingAdmin
        today={today}
        items={items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          kind: i.kind,
          unit: i.unit,
          supplier: i.supplier,
          active: i.active,
          currentCostEur: i.current?.unitCostEur ?? null,
          versions: i.versions.map((v) => ({ id: v.id, unitCostEur: v.unitCostEur, validFrom: v.validFrom, validTo: v.validTo, source: v.source })),
          perPortion: Object.fromEntries(perPortion.filter((p) => p.itemId === i.id).map((p) => [p.portionKind, p.quantity])),
        }))}
      />
    </>
  );
}
