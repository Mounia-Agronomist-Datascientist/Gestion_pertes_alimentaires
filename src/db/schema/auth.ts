import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { teams, zones } from "./organisation";

/** Rôles : equipe, resp_zone, resp_production, admin, direction (docs/SECURITE.md). */
export const roles = pgTable("roles", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
});

export const permissions = pgTable("permissions", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
});

/** Matrice d'autorisation centralisée. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleCode: text("role_code")
      .notNull()
      .references(() => roles.code),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code),
  },
  (t) => [primaryKey({ columns: [t.roleCode, t.permissionCode] })],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    login: text("login").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleCode: text("role_code")
      .notNull()
      .references(() => roles.code),
    teamId: uuid("team_id").references(() => teams.id),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_login_key").on(t.login),
    check(
      "users_team_account_has_team",
      sql`(${t.roleCode} = 'equipe') = (${t.teamId} is not null)`,
    ),
  ],
);

/** Zones dont un responsable de zone a la charge. */
export const userZones = pgTable(
  "user_zones",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.zoneId] })],
);

/** Sessions : seul le hachage du jeton est stocké. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/** Journal d'audit, en insertion seule (docs/SECURITE.md §4). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)],
);
