/**
 * Listes proposées dans le formulaire de déclaration, filtrées selon le compte connecté.
 * Les mêmes contrôles sont refaits à l'enregistrement (service.ts).
 */
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import type { LocalDate } from "@/domain/semaine-production";
import { weekCatalogs } from "@/modules/imports/catalog";
import { type AuthUser, can } from "@/modules/auth/permissions";
import { findStoredProductionWeek } from "@/modules/referentiels/weeks";

export async function getDeclarationOptions(db: Db, user: AuthUser, today: LocalDate) {
  const limitedToOwnZones = can(user, "declaration.read.zone") && !can(user, "declaration.read.all");

  const [zoneRows, subzoneRows, causeRows, causeZoneRows, causeSubzoneRows, destinationRows, unitRows, containerRows, productRows] =
    await Promise.all([
      db.select().from(s.zones).where(eq(s.zones.active, true)).orderBy(asc(s.zones.displayOrder)),
      db.select().from(s.subzones).where(eq(s.subzones.active, true)).orderBy(asc(s.subzones.displayOrder)),
      db.select().from(s.causes).where(eq(s.causes.status, "active")).orderBy(asc(s.causes.displayOrder)),
      db.select().from(s.causeZones),
      db.select().from(s.causeSubzones),
      db.select().from(s.destinations).where(eq(s.destinations.active, true)).orderBy(asc(s.destinations.displayOrder)),
      db.select().from(s.units).where(eq(s.units.active, true)).orderBy(asc(s.units.displayOrder)),
      db
        .select({ type: s.containerTypes, tare: s.containerTares })
        .from(s.containerTypes)
        .innerJoin(s.containerTares, eq(s.containerTares.containerTypeId, s.containerTypes.id))
        .where(
          and(
            eq(s.containerTypes.active, true),
            lte(s.containerTares.validFrom, today),
            or(isNull(s.containerTares.validTo), gte(s.containerTares.validTo, today)),
          ),
        )
        .orderBy(asc(s.containerTypes.displayOrder)),
      // Référentiel saisi à la main ; les produits de la semaine viennent de `weekCatalogs`.
      db.select().from(s.products).where(eq(s.products.active, true)).orderBy(asc(s.products.name)),
    ]);

  const zones = zoneRows
    .filter((z) => !limitedToOwnZones || user.zoneIds.includes(z.id))
    .map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      subzones: subzoneRows
        .filter((sz) => sz.zoneId === z.id)
        .map((sz) => ({ id: sz.id, name: sz.name, description: sz.description, teamMode: sz.teamMode })),
    }))
    .filter((z) => z.subzones.length > 0);

  // Équipes proposées aux comptes sans équipe (responsables, admin) : actives cette semaine.
  let teams: { id: string; letter: string; colorName: string; colorHex: string }[] = [];
  if (!user.teamId) {
    const week = await findStoredProductionWeek(db, today);
    const [teamRows, inactive] = await Promise.all([
      db.select().from(s.teams).where(eq(s.teams.active, true)).orderBy(asc(s.teams.displayOrder)),
      week
        ? db
            .select({ teamId: s.teamWeekStatus.teamId })
            .from(s.teamWeekStatus)
            .where(and(eq(s.teamWeekStatus.productionWeekId, week.id), eq(s.teamWeekStatus.active, false)))
        : Promise.resolve([]),
    ]);
    const inactiveIds = new Set(inactive.map((r) => r.teamId));
    teams = teamRows
      .filter((t) => !inactiveIds.has(t.id))
      .map((t) => ({ id: t.id, letter: t.letter, colorName: t.colorName, colorHex: t.colorHex }));
  }

  return {
    today,
    /** Plats, sous-recettes et ingrédients de la semaine en cours et de la précédente (imports en vigueur). */
    weekCatalogs: await weekCatalogs(db, user, today),
    zones,
    teams,
    causes: causeRows
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isOther: c.isOther,
        zoneIds: causeZoneRows.filter((cz) => cz.causeId === c.id).map((cz) => cz.zoneId),
        subzoneIds: causeSubzoneRows.filter((cs) => cs.causeId === c.id).map((cs) => cs.subzoneId),
      }))
      .sort((a, b) => Number(a.isOther) - Number(b.isOther)),
    destinations: destinationRows.map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
    units: unitRows.map((u) => ({ code: u.code, label: u.label, kind: u.kind, toBaseFactor: u.toBaseFactor })),
    containers: containerRows.map((r) => ({
      id: r.type.id,
      name: r.type.name,
      kind: r.type.kind,
      maxCount: r.type.maxCount,
      unitTareKg: r.tare.unitTareKg,
    })),
    products: productRows.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      externalId: p.externalId,
      variant: p.variant,
      category: p.category,
      unitWeightKg: p.unitWeightKg,
      densityKgPerL: p.densityKgPerL,
    })),
  };
}

export type DeclarationOptions = Awaited<ReturnType<typeof getDeclarationOptions>>;
