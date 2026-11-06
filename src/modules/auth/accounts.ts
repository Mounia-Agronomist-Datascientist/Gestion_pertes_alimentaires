import { eq } from "drizzle-orm";
import { userZones, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { writeAudit } from "@/modules/audit/audit";
import { assertPasswordPolicy, hashPassword } from "./password";
import { normalizeLogin } from "./service";

export interface NewAccount {
  login: string;
  displayName: string;
  roleCode: string;
  password: string;
  teamId?: string | null;
  zoneIds?: readonly string[];
  mustChangePassword?: boolean;
}

/** Crée un compte (mot de passe haché, zones rattachées, entrée d'audit). */
export async function createAccount(db: Db, account: NewAccount, actorId: string | null = null): Promise<string> {
  assertPasswordPolicy(account.password);
  const login = normalizeLogin(account.login);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        login,
        displayName: account.displayName,
        roleCode: account.roleCode,
        teamId: account.teamId ?? null,
        passwordHash: await hashPassword(account.password),
        mustChangePassword: account.mustChangePassword ?? true,
      })
      .returning({ id: users.id });
    if (!created) throw new Error("Création du compte impossible");
    if (account.zoneIds?.length) {
      await tx.insert(userZones).values(account.zoneIds.map((zoneId) => ({ userId: created.id, zoneId })));
    }
    await writeAudit(tx, {
      userId: actorId,
      action: "create",
      entity: "user",
      entityId: created.id,
      after: { login, displayName: account.displayName, roleCode: account.roleCode, teamId: account.teamId ?? null, zoneIds: account.zoneIds ?? [] },
    });
    return created.id;
  });
}

export async function accountExists(db: Db, login: string): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.login, normalizeLogin(login)));
  return rows.length > 0;
}
