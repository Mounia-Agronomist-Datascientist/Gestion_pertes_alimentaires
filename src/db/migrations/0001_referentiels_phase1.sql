CREATE TYPE "public"."team_mode" AS ENUM('equipe', 'zone');--> statement-breakpoint
CREATE TYPE "public"."cause_status" AS ENUM('proposee', 'active', 'rejetee', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."container_kind" AS ENUM('gastro', 'support');--> statement-breakpoint
CREATE TYPE "public"."destination_kind" AS ENUM('destruction', 'compost', 'don', 'personnel', 'vente', 'reutilisation', 'retour_fournisseur', 'autre');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('matiere_premiere', 'sous_recette', 'recette', 'produit_fini', 'produit_externe', 'consommable');--> statement-breakpoint
CREATE TYPE "public"."unit_kind" AS ENUM('masse', 'volume', 'comptage');--> statement-breakpoint
CREATE TABLE "subzones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"team_mode" "team_mode" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subzones_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "team_week_status" (
	"team_id" uuid NOT NULL,
	"production_week_id" uuid NOT NULL,
	"active" boolean NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_week_status_team_id_production_week_id_pk" PRIMARY KEY("team_id","production_week_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letter" text NOT NULL,
	"color_name" text NOT NULL,
	"color_hex" text NOT NULL,
	"usual_start" time,
	"usual_end" time,
	"managers_label" text,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_letter_key" UNIQUE("letter"),
	CONSTRAINT "teams_color_hex_format" CHECK ("teams"."color_hex" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"requires_justification" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zones_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cause_zones" (
	"cause_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	CONSTRAINT "cause_zones_cause_id_zone_id_pk" PRIMARY KEY("cause_id","zone_id")
);
--> statement-breakpoint
CREATE TABLE "causes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"is_other" boolean DEFAULT false NOT NULL,
	"status" "cause_status" DEFAULT 'active' NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"proposed_by" uuid,
	"proposed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_tares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_type_id" uuid NOT NULL,
	"unit_tare_kg" numeric(8, 3) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "container_tares_type_valid_from_key" UNIQUE("container_type_id","valid_from"),
	CONSTRAINT "container_tares_positive" CHECK ("container_tares"."unit_tare_kg" > 0),
	CONSTRAINT "container_tares_period" CHECK ("container_tares"."valid_to" is null or "container_tares"."valid_to" >= "container_tares"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "container_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "container_kind" NOT NULL,
	"max_count" smallint,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "container_types_code_key" UNIQUE("code"),
	CONSTRAINT "container_types_max_count_positive" CHECK ("container_types"."max_count" is null or "container_types"."max_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "destination_kind" NOT NULL,
	"financial_recovery" boolean DEFAULT false NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinations_code_key" UNIQUE("code"),
	CONSTRAINT "destinations_recovery_only_for_sales" CHECK (not "destinations"."financial_recovery" or "destinations"."kind" = 'vente')
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "product_category" NOT NULL,
	"external_id" text,
	"code" text,
	"name" text NOT NULL,
	"variant" text,
	"default_unit" text NOT NULL,
	"unit_weight_kg" numeric(12, 4),
	"density_kg_per_l" numeric(8, 4),
	"source" text DEFAULT 'manuel' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_unit_weight_positive" CHECK ("products"."unit_weight_kg" is null or "products"."unit_weight_kg" > 0),
	CONSTRAINT "products_density_positive" CHECK ("products"."density_kg_per_l" is null or "products"."density_kg_per_l" > 0)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"kind" "unit_kind" NOT NULL,
	"to_base_factor" numeric(12, 6) NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "units_factor_positive" CHECK ("units"."to_base_factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_code" text NOT NULL,
	"permission_code" text NOT NULL,
	CONSTRAINT "role_permissions_role_code_permission_code_pk" PRIMARY KEY("role_code","permission_code")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_zones" (
	"user_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	CONSTRAINT "user_zones_user_id_zone_id_pk" PRIMARY KEY("user_id","zone_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_code" text NOT NULL,
	"team_id" uuid,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_key" UNIQUE("login"),
	CONSTRAINT "users_team_account_has_team" CHECK (("users"."role_code" = 'equipe') = ("users"."team_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "subzones" ADD CONSTRAINT "subzones_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_week_status" ADD CONSTRAINT "team_week_status_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_week_status" ADD CONSTRAINT "team_week_status_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cause_zones" ADD CONSTRAINT "cause_zones_cause_id_causes_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."causes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cause_zones" ADD CONSTRAINT "cause_zones_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "causes" ADD CONSTRAINT "causes_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "causes" ADD CONSTRAINT "causes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_tares" ADD CONSTRAINT "container_tares_container_type_id_container_types_id_fk" FOREIGN KEY ("container_type_id") REFERENCES "public"."container_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_tares" ADD CONSTRAINT "container_tares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_unit_units_code_fk" FOREIGN KEY ("default_unit") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_code_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."roles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_zones" ADD CONSTRAINT "user_zones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_zones" ADD CONSTRAINT "user_zones_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_code_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."roles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "causes_code_key" ON "causes" USING btree ("code") WHERE "causes"."code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_external_id_key" ON "products" USING btree ("external_id") WHERE "products"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_category_code_key" ON "products" USING btree ("category","code") WHERE "products"."code" is not null;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");