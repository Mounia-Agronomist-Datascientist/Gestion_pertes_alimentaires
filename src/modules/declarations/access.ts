/**
 * Droits sur une déclaration existante (docs/SECURITE.md §1).
 * Fonctions pures : testables sans base de données.
 */
import { addDays, computeProductionWeek, type LocalDate } from "@/domain/semaine-production";
import { type AuthUser, can, declarationReadScope } from "@/modules/auth/permissions";

export interface DeclarationAccessFields {
  zoneId: string;
  teamId: string | null;
  createdBy: string;
  occurredOn: LocalDate;
}

/**
 * Règle validée le 06/11/2026 : les équipes déclarent leurs pertes le jour même, avec un délai
 * maximal d'une semaine (déclaration et correction). Au-delà, un responsable doit intervenir.
 */
export const TEAM_DELAY_DAYS = 7;

/** Comptes soumis au délai : ceux qui n'ont de droits de correction que sur leur équipe. */
export function isBoundByTeamDelay(user: AuthUser): boolean {
  return !can(user, "declaration.correct.zone") && !can(user, "declaration.correct.all");
}

export function isWithinTeamDelay(occurredOn: LocalDate, today: LocalDate): boolean {
  return today <= addDays(occurredOn, TEAM_DELAY_DAYS);
}

/**
 * Dernier jour où une équipe peut corriger ou annuler une perte (décision du 17/11/2026) : une semaine après la
 * fin de la semaine de production de la perte (mercredi + 7 jours).
 */
export function teamCorrectionDeadline(occurredOn: LocalDate): LocalDate {
  return addDays(computeProductionWeek(occurredOn).endDate, TEAM_DELAY_DAYS);
}

export function isWithinTeamCorrectionDelay(occurredOn: LocalDate, today: LocalDate): boolean {
  return today <= teamCorrectionDeadline(occurredOn);
}

export function canReadDeclaration(user: AuthUser, d: DeclarationAccessFields): boolean {
  const scope = declarationReadScope(user);
  switch (scope.kind) {
    case "zones":
      return scope.zoneIds.includes(d.zoneId);
    case "team":
      return scope.zoneIds.includes(d.zoneId) && (d.teamId === scope.teamId || d.createdBy === scope.userId);
    case "none":
      return false;
  }
}

/** Droit de corriger ou d'annuler une déclaration existante (toujours dans une zone cochée du compte). */
export function canModifyDeclaration(user: AuthUser, d: DeclarationAccessFields, today: LocalDate): boolean {
  if (!user.zoneIds.includes(d.zoneId)) return false;
  if (can(user, "declaration.correct.all") || can(user, "declaration.correct.zone")) return true;
  if (can(user, "declaration.correct.team")) {
    const own = d.teamId === user.teamId || d.createdBy === user.id;
    return own && isWithinTeamCorrectionDelay(d.occurredOn, today);
  }
  return false;
}
