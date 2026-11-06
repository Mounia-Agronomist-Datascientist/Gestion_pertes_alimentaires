import { eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { generateProductionCalendar } from "@/domain/semaine-production";
import * as schema from "../schema";
import {
  CALENDAR_YEARS,
  CAUSES,
  CONTAINERS,
  DESTINATIONS,
  OTHER_CAUSE,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  TARE_SOURCE,
  TARE_VALID_FROM,
  TEAMS,
  UNITS,
  ZONES,
} from "./data";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Initialise les référentiels. Idempotent : un élément déjà présent (même code) n'est jamais
 * modifié, afin de ne pas écraser les ajustements faits ensuite par l'administration.
 */
export async function seed(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(schema.roles).values([...ROLES]).onConflictDoNothing();
    await tx.insert(schema.permissions).values([...PERMISSIONS]).onConflictDoNothing();
    await tx
      .insert(schema.rolePermissions)
      .values(
        Object.entries(ROLE_PERMISSIONS).flatMap(([roleCode, codes]) =>
          codes.map((permissionCode) => ({ roleCode, permissionCode })),
        ),
      )
      .onConflictDoNothing();

    await tx
      .insert(schema.units)
      .values(UNITS.map((u, i) => ({ ...u, displayOrder: i })))
      .onConflictDoNothing();

    await tx
      .insert(schema.teams)
      .values(TEAMS.map((t, i) => ({ ...t, displayOrder: i })))
      .onConflictDoNothing();

    await tx
      .insert(schema.productionWeeks)
      .values(CALENDAR_YEARS.flatMap(generateProductionCalendar))
      .onConflictDoNothing();

    await tx
      .insert(schema.zones)
      .values(ZONES.map((z, i) => ({ code: z.code, name: z.name, displayOrder: i })))
      .onConflictDoNothing();
    const zoneRows = await tx.select({ id: schema.zones.id, code: schema.zones.code }).from(schema.zones);
    const zoneId = new Map(zoneRows.map((z) => [z.code, z.id]));

    await tx
      .insert(schema.subzones)
      .values(
        ZONES.flatMap((z) =>
          z.subzones.map((s, i) => ({
            zoneId: zoneId.get(z.code)!,
            code: s.code,
            name: s.name,
            description: "description" in s ? s.description : null,
            teamMode: z.teamMode,
            displayOrder: i,
          })),
        ),
      )
      .onConflictDoNothing();

    const allCauses = [{ ...OTHER_CAUSE, isOther: true, zones: [] }, ...CAUSES.map((c) => ({ ...c, isOther: false }))];
    await tx
      .insert(schema.causes)
      .values(
        allCauses.map((c, i) => ({
          code: c.code,
          name: c.name,
          description: c.description ?? null,
          isOther: c.isOther,
          displayOrder: c.isOther ? 999 : i,
        })),
      )
      .onConflictDoNothing();
    const causeRows = await tx
      .select({ id: schema.causes.id, code: schema.causes.code })
      .from(schema.causes)
      .where(inArray(schema.causes.code, allCauses.map((c) => c.code)));
    const causeId = new Map(causeRows.map((c) => [c.code, c.id]));
    await tx
      .insert(schema.causeZones)
      .values(CAUSES.flatMap((c) => c.zones.map((z) => ({ causeId: causeId.get(c.code)!, zoneId: zoneId.get(z)! }))))
      .onConflictDoNothing();

    await tx
      .insert(schema.destinations)
      .values(DESTINATIONS.map((d, i) => ({ ...d, displayOrder: i })))
      .onConflictDoNothing();

    for (const [i, c] of CONTAINERS.entries()) {
      const [inserted] = await tx
        .insert(schema.containerTypes)
        .values({ code: c.code, name: c.name, kind: c.kind, maxCount: c.maxCount, displayOrder: i })
        .onConflictDoNothing()
        .returning({ id: schema.containerTypes.id });
      if (inserted) {
        await tx.insert(schema.containerTares).values({
          containerTypeId: inserted.id,
          unitTareKg: c.unitTareKg,
          validFrom: TARE_VALID_FROM,
          source: TARE_SOURCE,
        });
      }
    }
  });
}

/** Utilitaire de test : identifiant d'une zone par son code. */
export async function zoneIdByCode(db: Db, code: string): Promise<string> {
  const [row] = await db.select({ id: schema.zones.id }).from(schema.zones).where(eq(schema.zones.code, code));
  if (!row) throw new Error(`Zone inconnue : ${code}`);
  return row.id;
}
