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
  | "indicators.read"
  | "alerts.read.all"
  | "alerts.resolve";

export interface AuthUser {
  id: string;
  login: string;
  displayName: string;
  roleCode: string;
  teamId: string | null;
  team: { letter: string; colorName: string; colorHex: string } | null;
  /** Zones cochées pour ce compte : saisie et résultats limités à ces zones (décision du 19/11/2026). */
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

/**
 * Périmètre de lecture des déclarations, appliqué par les requêtes côté serveur. Toujours limité aux zones cochées
 * du compte (décision du 19/11/2026) ; une équipe ne lit en plus que ses propres pertes.
 */
export type DeclarationScope =
  | { kind: "zones"; zoneIds: readonly string[] }
  | { kind: "team"; teamId: string; userId: string; zoneIds: readonly string[] }
  | { kind: "none" };

export function declarationReadScope(user: AuthUser): DeclarationScope {
  if (!user.zoneIds.length) return { kind: "none" };
  if (can(user, "declaration.read.all") || can(user, "declaration.read.zone"))
    return { kind: "zones", zoneIds: user.zoneIds };
  if (can(user, "declaration.read.team") && user.teamId) {
    return { kind: "team", teamId: user.teamId, userId: user.id, zoneIds: user.zoneIds };
  }
  return { kind: "none" };
}

/** Le compte peut-il saisir (et voir) les pertes de cette zone ? */
export const hasZone = (user: AuthUser, zoneId: string) => user.zoneIds.includes(zoneId);
