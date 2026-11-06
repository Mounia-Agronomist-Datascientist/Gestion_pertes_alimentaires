/**
 * Droits sur une déclaration existante (docs/SECURITE.md §1).
 * Fonctions pures : testables sans base de données.
 */
import type { LocalDate } from "@/domain/semaine-production";
import { type AuthUser, can, declarationReadScope } from "@/modules/auth/permissions";

export interface DeclarationAccessFields {
  zoneId: string;
  teamId: string | null;
  createdBy: string;
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

/**
 * ⚠️ Règle proposée, en attente de validation (docs/POINTS_A_VALIDER.md C1) :
 * une équipe peut corriger ses déclarations jusqu'à la fin de la semaine de production
 * pendant laquelle elles ont été saisies ; au-delà, un responsable doit le faire.
 */
export function canModifyDeclaration(
  user: AuthUser,
  d: DeclarationAccessFields,
  declaredWeekEnd: LocalDate,
  today: LocalDate,
): boolean {
  if (can(user, "declaration.correct.all")) return true;
  if (can(user, "declaration.correct.zone")) return user.zoneIds.includes(d.zoneId);
  if (can(user, "declaration.correct.team")) {
    const own = d.teamId === user.teamId || d.createdBy === user.id;
    return own && today <= declaredWeekEnd;
  }
  return false;
}
