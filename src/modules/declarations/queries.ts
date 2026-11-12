/**
 * Lecture des déclarations, toujours filtrée par le périmètre du compte connecté (docs/SECURITE.md §2).
 */
import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { daysBetween, toProductionLocalDate } from "@/domain/semaine-production";
import { type AuthUser, declarationReadScope } from "@/modules/auth/permissions";
import { canModifyDeclaration, canReadDeclaration } from "./access";

/** Condition SQL du périmètre de lecture ; `null` si l'utilisateur ne peut rien lire. */
export function scopeCondition(user: AuthUser): SQL | undefined | null {
  const scope = declarationReadScope(user);
  switch (scope.kind) {
    case "all":
      return undefined;
    case "zones":
      return scope.zoneIds.length ? inArray(s.lossDeclarations.zoneId, [...scope.zoneIds]) : null;
    case "team":
      return or(eq(s.lossDeclarations.teamId, scope.teamId), eq(s.lossDeclarations.createdBy, scope.userId));
    case "none":
      return null;
  }
}

export interface DeclarationFilters {
  productionWeekId?: string;
  zoneId?: string;
  includeCancelled?: boolean;
}

export async function listDeclarations(db: Db, user: AuthUser, filters: DeclarationFilters = {}, limit = 200) {
  const scope = scopeCondition(user);
  if (scope === null) return [];
  const conditions = [
    scope,
    filters.productionWeekId ? eq(s.lossDeclarations.productionWeekId, filters.productionWeekId) : undefined,
    filters.zoneId ? eq(s.lossDeclarations.zoneId, filters.zoneId) : undefined,
    filters.includeCancelled ? undefined : inArray(s.lossDeclarations.status, ["validee", "corrigee"]),
  ];
  return db
    .select({
      id: s.lossDeclarations.id,
      status: s.lossDeclarations.status,
      occurredOn: s.lossDeclarations.occurredOn,
      declaredAt: s.lossDeclarations.declaredAt,
      isLate: s.lossDeclarations.isLate,
      productName: s.lossDeclarations.productName,
      productCode: s.lossDeclarations.productCode,
      productUnlisted: s.lossDeclarations.productUnlisted,
      netQuantity: s.lossDeclarations.netQuantity,
      netUnitCode: s.lossDeclarations.netUnitCode,
      netKg: s.lossDeclarations.netKg,
      causeName: s.lossDeclarations.causeName,
      zoneName: s.zones.name,
      subzoneName: s.subzones.name,
      teamLetter: s.teams.letter,
      teamColorHex: s.teams.colorHex,
      weekYear: s.productionWeeks.year,
      weekNumber: s.productionWeeks.number,
    })
    .from(s.lossDeclarations)
    .innerJoin(s.zones, eq(s.lossDeclarations.zoneId, s.zones.id))
    .innerJoin(s.subzones, eq(s.lossDeclarations.subzoneId, s.subzones.id))
    .innerJoin(s.productionWeeks, eq(s.lossDeclarations.productionWeekId, s.productionWeeks.id))
    .leftJoin(s.teams, eq(s.lossDeclarations.teamId, s.teams.id))
    .where(and(...conditions))
    .orderBy(desc(s.lossDeclarations.occurredOn), desc(s.lossDeclarations.declaredAt))
    .limit(limit);
}

export type DeclarationListItem = Awaited<ReturnType<typeof listDeclarations>>[number];

/** Détail d'une déclaration avec ses versions ; `null` si elle est hors du périmètre de l'utilisateur. */
export async function getDeclarationDetail(db: Db, user: AuthUser, id: string, now = new Date()) {
  const [row] = await db
    .select({
      declaration: s.lossDeclarations,
      zoneName: s.zones.name,
      subzoneName: s.subzones.name,
      teamLetter: s.teams.letter,
      teamColorName: s.teams.colorName,
      teamColorHex: s.teams.colorHex,
      authorName: s.users.displayName,
    })
    .from(s.lossDeclarations)
    .innerJoin(s.zones, eq(s.lossDeclarations.zoneId, s.zones.id))
    .innerJoin(s.subzones, eq(s.lossDeclarations.subzoneId, s.subzones.id))
    .innerJoin(s.users, eq(s.lossDeclarations.createdBy, s.users.id))
    .leftJoin(s.teams, eq(s.lossDeclarations.teamId, s.teams.id))
    .where(eq(s.lossDeclarations.id, id));
  if (!row || !canReadDeclaration(user, row.declaration)) return null;
  const d = row.declaration;

  const [weeks, containers, destinations, revisions] = await Promise.all([
    db.select().from(s.productionWeeks).where(eq(s.productionWeeks.id, d.productionWeekId)),
    db
      .select({
        containerTypeId: s.containerTypes.id,
        kind: s.containerTypes.kind,
        name: s.containerTypes.name,
        count: s.declarationContainers.count,
        tareKg: s.declarationContainers.tareKgSnapshot,
      })
      .from(s.declarationContainers)
      .innerJoin(s.containerTares, eq(s.declarationContainers.containerTareId, s.containerTares.id))
      .innerJoin(s.containerTypes, eq(s.containerTares.containerTypeId, s.containerTypes.id))
      .where(and(eq(s.declarationContainers.declarationId, id), eq(s.declarationContainers.revision, d.revision))),
    db
      .select({
        destinationId: s.declarationDestinations.destinationId,
        name: s.destinations.name,
        quantity: s.declarationDestinations.quantity,
        netKg: s.declarationDestinations.netKg,
        recoveredAmount: s.declarationDestinations.recoveredAmount,
        financialRecovery: s.destinations.financialRecovery,
      })
      .from(s.declarationDestinations)
      .innerJoin(s.destinations, eq(s.declarationDestinations.destinationId, s.destinations.id))
      .where(and(eq(s.declarationDestinations.declarationId, id), eq(s.declarationDestinations.revision, d.revision))),
    db
      .select({
        revision: s.declarationRevisions.revision,
        status: s.declarationRevisions.status,
        changedAt: s.declarationRevisions.changedAt,
        reason: s.declarationRevisions.reason,
        data: s.declarationRevisions.data,
        changedByName: s.users.displayName,
      })
      .from(s.declarationRevisions)
      .innerJoin(s.users, eq(s.declarationRevisions.changedBy, s.users.id))
      .where(eq(s.declarationRevisions.declarationId, id))
      .orderBy(desc(s.declarationRevisions.revision)),
  ]);
  const productionWeek = weeks.find((w) => w.id === d.productionWeekId)!;

  return {
    ...row,
    productionWeek,
    containers,
    destinations,
    revisions,
    canModify: d.status !== "annulee" && canModifyDeclaration(user, d, toProductionLocalDate(now)),
    /** Jours entre la perte et sa saisie (0 = saisie le jour même). */
    delayDays: daysBetween(d.occurredOn, toProductionLocalDate(d.declaredAt)),
  };
}

export type DeclarationDetail = NonNullable<Awaited<ReturnType<typeof getDeclarationDetail>>>;
