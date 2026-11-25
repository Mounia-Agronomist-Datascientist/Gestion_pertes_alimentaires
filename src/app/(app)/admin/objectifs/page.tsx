import Link from "next/link";
import { db } from "@/db/client";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { listZoneTargets } from "@/modules/objectifs";
import { TargetsAdmin } from "./targets-admin";

export const metadata = { title: "Objectifs par zone — Administration" };

export default async function TargetsPage() {
  const admin = await requireUser();
  const today = toProductionLocalDate(new Date());
  const zones = await listZoneTargets(db, admin, today);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Objectifs par zone</h1>
      <p className="text-sm text-slate-600">
        Objectif de chaque zone : au plus N kg de pertes alimentaires par semaine de production (retours fournisseur non
        comptés). Daté : un nouvel objectif s&apos;applique à partir de sa date, l&apos;ancien reste dans
        l&apos;historique. Suivi de l&apos;écart et des progrès : Statistiques → Objectifs.
      </p>
      <TargetsAdmin
        today={today}
        zones={zones
          .filter((z) => z.active)
          .map((z) => ({
            id: z.id,
            name: z.name,
            current: z.current ? { maxKgPerWeek: z.current.maxKgPerWeek } : null,
            versions: z.versions.map((v) => ({
              id: v.id,
              maxKgPerWeek: v.maxKgPerWeek,
              validFrom: v.validFrom,
              validTo: v.validTo,
              source: v.source,
            })),
          }))}
      />
    </>
  );
}
