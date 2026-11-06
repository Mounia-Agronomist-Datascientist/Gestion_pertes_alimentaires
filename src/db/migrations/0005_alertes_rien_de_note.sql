CREATE TYPE "public"."missing_declaration_status" AS ENUM('active', 'regularisee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."reuse_window" AS ENUM('jeudi_vendredi', 'lundi_mercredi');--> statement-breakpoint
CREATE TABLE "missing_declaration_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"production_week_id" uuid NOT NULL,
	"window" "reuse_window" NOT NULL,
	"first_day" date NOT NULL,
	"last_day" date NOT NULL,
	"estimated_kg" numeric(10, 3) NOT NULL,
	"status" "missing_declaration_status" DEFAULT 'active' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text,
	CONSTRAINT "missing_declaration_alerts_team_week_window_key" UNIQUE("team_id","production_week_id","window"),
	CONSTRAINT "missing_declaration_alerts_positive" CHECK ("missing_declaration_alerts"."estimated_kg" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_days" (
	"day" date PRIMARY KEY NOT NULL,
	"production_week_id" uuid NOT NULL,
	"is_production_day" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'defaut' NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missing_declaration_alerts" ADD CONSTRAINT "missing_declaration_alerts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_declaration_alerts" ADD CONSTRAINT "missing_declaration_alerts_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_declaration_alerts" ADD CONSTRAINT "missing_declaration_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_days" ADD CONSTRAINT "production_days_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;