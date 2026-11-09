import Link from "next/link";
import { db } from "@/db/client";
import { listZonesForAdmin } from "@/modules/admin/places";
import { requireUser } from "@/modules/auth/next-session";
import { ZonesAdmin } from "./zones-admin";

export const metadata = { title: "Zones et postes — Administration" };

export default async function ZonesPage() {
  const admin = await requireUser();
  const zones = await listZonesForAdmin(db, admin);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Zones et postes</h1>
      <p className="text-sm text-slate-600">
        Un nouveau nom s&apos;affiche aussi dans l&apos;historique des pertes : pour un poste vraiment différent,
        créez-en un nouveau et désactivez l&apos;ancien. L&apos;attribution des pertes (à l&apos;équipe en cuisine, à la
        zone ailleurs) ne se modifie pas ici.
      </p>
      <ZonesAdmin
        zones={zones.map((z) => ({
          id: z.id,
          name: z.name,
          subzones: z.subzones.map((sz) => ({
            id: sz.id,
            name: sz.name,
            description: sz.description,
            teamMode: sz.teamMode,
            active: sz.active,
          })),
        }))}
      />
    </>
  );
}
