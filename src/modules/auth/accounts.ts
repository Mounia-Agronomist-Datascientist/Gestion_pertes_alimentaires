import { and, eq, inArray } from "drizzle-orm";
import { userZones, users, zones } from "@/db/schema";
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

/**
 * Zones cochées par défaut d'un nouveau compte (décision du 19/11/2026) : une équipe en Cuisine/production, un
 * responsable de zone aucune (à choisir), les autres profils toutes les zones.
 */
export const DEFAULT_ZONE_CODES: Record<string, readonly string[] | "toutes"> = {
  equipe: ["CUISINE"],
  resp_zone: [],
};

export async function defaultZoneIds(db: Db, roleCode: string): Promise<string[]> {
  const codes = DEFAULT_ZONE_CODES[roleCode] ?? "toutes";
  if (codes !== "toutes" && !codes.length) return [];
  const rows = await db
    .select({ id: zones.id })
    .from(zones)
    .where(codes === "toutes" ? eq(zones.active, true) : and(eq(zones.active, true), inArray(zones.code, [...codes])));
  return rows.map((r) => r.id);
}

/** Crée un compte (mot de passe haché, zones rattachées, entrée d'audit). Sans zones indiquées : celles par défaut. */
export async function createAccount(db: Db, account: NewAccount, actorId: string | null = null): Promise<string> {
  assertPasswordPolicy(account.password);
  const login = normalizeLogin(account.login);
  const zoneIds = account.zoneIds ?? (await defaultZoneIds(db, account.roleCode));
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
    if (zoneIds.length) {
      await tx.insert(userZones).values(zoneIds.map((zoneId) => ({ userId: created.id, zoneId })));
    }
    await writeAudit(tx, {
      userId: actorId,
      action: "create",
      entity: "user",
      entityId: created.id,
      after: {
        login,
        displayName: account.displayName,
        roleCode: account.roleCode,
        teamId: account.teamId ?? null,
        zoneIds,
      },
    });
    return created.id;
  });
}

export async function accountExists(db: Db, login: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.login, normalizeLogin(login)));
  return rows.length > 0;
}
