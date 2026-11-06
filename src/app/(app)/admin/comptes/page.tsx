import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { listAccounts } from "@/modules/admin/accounts";
import { requireUser } from "@/modules/auth/next-session";
import { AccountsAdmin } from "./accounts-admin";

export const metadata = { title: "Comptes — Administration" };

export default async function AccountsPage() {
  const admin = await requireUser();
  const [accounts, teams, zones] = await Promise.all([
    listAccounts(db, admin),
    db.select({ id: s.teams.id, letter: s.teams.letter, colorName: s.teams.colorName }).from(s.teams).orderBy(asc(s.teams.displayOrder)),
    db.select({ id: s.zones.id, name: s.zones.name }).from(s.zones).where(eq(s.zones.active, true)).orderBy(asc(s.zones.displayOrder)),
  ]);
  return (
    <>
      <Link href="/admin" className="self-start rounded-xl px-2 py-2 font-medium text-slate-700">
        ← Administration
      </Link>
      <h1 className="text-2xl font-bold">Comptes</h1>
      <AccountsAdmin
        adminId={admin.id}
        accounts={accounts.map((a) => ({ ...a, lastLoginAt: a.lastLoginAt?.toISOString() ?? null }))}
        teams={teams}
        zones={zones}
      />
    </>
  );
}
