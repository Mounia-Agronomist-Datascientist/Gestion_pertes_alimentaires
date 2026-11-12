import Link from "next/link";
import { db } from "@/db/client";
import { listDestinationsForAdmin } from "@/modules/admin/places";
import { requireUser } from "@/modules/auth/next-session";
import { DestinationsAdmin } from "./destinations-admin";

export const metadata = { title: "Destinations — Administration" };

export default async function DestinationsPage() {
  const admin = await requireUser();
  const destinations = await listDestinationsForAdmin(db, admin);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Destinations</h1>
      <p className="text-sm text-slate-600">
        L&apos;ordre de la liste est celui proposé à la saisie. Un nouveau nom s&apos;affiche aussi dans l&apos;historique :
        pour une destination vraiment différente, créez-en une nouvelle et désactivez l&apos;ancienne.
      </p>
      <DestinationsAdmin
        destinations={destinations.map((d) => ({
          id: d.id,
          name: d.name,
          kind: d.kind,
          financialRecovery: d.financialRecovery,
          binNumberMode: d.binNumberMode,
          active: d.active,
          used: d.used,
        }))}
      />
    </>
  );
}
