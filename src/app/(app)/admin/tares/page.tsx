import Link from "next/link";
import { db } from "@/db/client";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { listContainersForAdmin } from "@/modules/admin/containers";
import { requireUser } from "@/modules/auth/next-session";
import { TaresAdmin } from "./tares-admin";

export const metadata = { title: "Gastros et tares — Administration" };

export default async function TaresPage() {
  const admin = await requireUser();
  const today = toProductionLocalDate(new Date());
  const containers = await listContainersForAdmin(db, admin, today);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Gastros et tares</h1>
      <p className="text-sm text-slate-600">
        Une nouvelle tare s&apos;applique à partir de la date choisie ; la précédente reste valable jusqu&apos;à la
        veille. Les pertes déjà enregistrées gardent la tare utilisée au moment de la saisie.
      </p>
      <TaresAdmin
        today={today}
        containers={containers.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          maxCount: c.maxCount,
          active: c.active,
          currentTareKg: c.current?.unitTareKg ?? null,
          versions: c.versions.map((v) => ({ id: v.id, unitTareKg: v.unitTareKg, validFrom: v.validFrom, validTo: v.validTo, source: v.source, used: v.used })),
        }))}
      />
    </>
  );
}
