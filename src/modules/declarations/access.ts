/**
 * Droits sur une déclaration existante (docs/SECURITE.md §1).
 * Fonctions pures : testables sans base de données.
 */
import { addDays, type LocalDate } from "@/domain/semaine-production";
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

export function canReadDeclaration(user: AuthUser, d: DeclarationAccessFields): boolean {
  const scope = declarationReadScope(user);
  switch (scope.kind) {
    case "all":
      return true;
    case "zones":
      return scope.zoneIds.includes(d.zoneId);
    case "team":
      return d.teamId === scope.teamId || d.createdBy === scope.userId;
    case "none":
      return false;
  }
}

/** Droit de corriger ou d'annuler une déclaration existante. */
export function canModifyDeclaration(user: AuthUser, d: DeclarationAccessFields, today: LocalDate): boolean {
  if (can(user, "declaration.correct.all")) return true;
  if (can(user, "declaration.correct.zone")) return user.zoneIds.includes(d.zoneId);
  if (can(user, "declaration.correct.team")) {
    const own = d.teamId === user.teamId || d.createdBy === user.id;
    return own && isWithinTeamDelay(d.occurredOn, today);
  }
  return false;
}
