import Link from "next/link";
import { db } from "@/db/client";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { listLabourRates } from "@/modules/admin/labour";
import { requireUser } from "@/modules/auth/next-session";
import { LabourAdmin } from "./labour-admin";

export const metadata = { title: "Main-d'œuvre — Administration" };

export default async function LabourPage() {
  const admin = await requireUser();
  const today = toProductionLocalDate(new Date());
  const zones = await listLabourRates(db, admin, today);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Main-d&apos;œuvre</h1>
      <p className="rounded-xl bg-amber-50 p-3 text-amber-950">
        Coût horaire moyen par zone, daté. Il est <strong>enregistré mais pas encore imputé aux pertes</strong> : la
        méthode d&apos;affectation (temps réellement perdu, coût par unité produite…) doit d&apos;abord être définie
        (cahier des charges §18.2). La production n&apos;a pas de coût par poste : aucun n&apos;est inventé.
      </p>
      <LabourAdmin
        today={today}
        zones={zones
          .filter((z) => z.active)
          .map((z) => ({
            id: z.id,
            name: z.name,
            current: z.current ? { hourlyCostEur: z.current.hourlyCostEur, unit: z.current.unit } : null,
            versions: z.versions.map((v) => ({ id: v.id, hourlyCostEur: v.hourlyCostEur, unit: v.unit, validFrom: v.validFrom, validTo: v.validTo, source: v.source })),
          }))}
      />
    </>
  );
}
