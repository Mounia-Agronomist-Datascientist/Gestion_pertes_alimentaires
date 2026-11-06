/**
 * Matrice d'autorisation : point d'entrée unique pour tester un droit (docs/SECURITE.md §1).
 * Aucun écran ni service ne doit tester un rôle directement.
 */
export type PermissionCode =
  | "declaration.create"
  | "declaration.read.team"
  | "declaration.read.zone"
  | "declaration.read.all"
  | "declaration.correct.team"
  | "declaration.correct.zone"
  | "declaration.correct.all"
  | "cause.propose"
  | "cause.review"
  | "stats.global"
  | "stats.compare_teams"
  | "referentiel.manage"
  | "user.manage"
  | "audit.read"
  | "indicators.read";

export interface AuthUser {
  id: string;
  login: string;
  displayName: string;
  roleCode: string;
  teamId: string | null;
  team: { letter: string; colorName: string; colorHex: string } | null;
  zoneIds: readonly string[];
  permissions: ReadonlySet<string>;
  mustChangePassword: boolean;
}

export class ForbiddenError extends Error {
  constructor(message = "Action non autorisée") {
    super(message);
  }
}

export function can(user: AuthUser, permission: PermissionCode): boolean {
  return user.permissions.has(permission);
}

export function requirePermission(user: AuthUser, permission: PermissionCode): void {
  if (!can(user, permission)) {
    throw new ForbiddenError();
  }
}

/** Périmètre de lecture des déclarations, appliqué par les requêtes côté serveur. */
export type DeclarationScope =
  | { kind: "all" }
  | { kind: "zones"; zoneIds: readonly string[] }
  | { kind: "team"; teamId: string; userId: string }
  | { kind: "none" };

export function declarationReadScope(user: AuthUser): DeclarationScope {
  if (can(user, "declaration.read.all")) return { kind: "all" };
  if (can(user, "declaration.read.zone")) return { kind: "zones", zoneIds: user.zoneIds };
  if (can(user, "declaration.read.team") && user.teamId) {
    return { kind: "team", teamId: user.teamId, userId: user.id };
  }
  return { kind: "none" };
}
