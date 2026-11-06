import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { listCausesForAdmin } from "@/modules/admin/causes";
import { requireUser } from "@/modules/auth/next-session";
import { CausesAdmin } from "./causes-admin";

export const metadata = { title: "Causes — Administration" };

export default async function CausesPage() {
  const admin = await requireUser();
  const [causes, zones] = await Promise.all([
    listCausesForAdmin(db, admin),
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones).where(eq(s.zones.active, true)).orderBy(asc(s.zones.displayOrder)),
  ]);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Causes</h1>
      <CausesAdmin
        zones={zones}
        causes={causes.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          status: c.status,
          isOther: c.isOther,
          zoneIds: c.zoneIds,
          subzoneNames: c.subzoneNames,
          proposedByName: c.proposedByName,
          proposedAt: c.proposedAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
