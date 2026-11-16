CREATE TYPE "public"."loss_alert_kind" AS ENUM('perte_inhabituelle', 'cause_recurrente');--> statement-breakpoint
CREATE TYPE "public"."loss_alert_scope" AS ENUM('equipe', 'zone', 'plat');--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"unusual_rate" numeric(5, 3) DEFAULT 0.5 NOT NULL,
	"min_kg" numeric(8, 3) DEFAULT 5 NOT NULL,
	"recurrence_weeks" smallint DEFAULT 3 NOT NULL,
	"trend_stable_rate" numeric(5, 3) DEFAULT 0.1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "alert_settings_single_row" CHECK ("alert_settings"."id" = 1),
	CONSTRAINT "alert_settings_values" CHECK ("alert_settings"."unusual_rate" > 0 and "alert_settings"."min_kg" >= 0 and "alert_settings"."recurrence_weeks" >= 2 and "alert_settings"."trend_stable_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "loss_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "loss_alert_kind" NOT NULL,
	"production_week_id" uuid NOT NULL,
	"scope" "loss_alert_scope" NOT NULL,
	"subject_key" text NOT NULL,
	"team_id" uuid,
	"label" text NOT NULL,
	"measure" text,
	"value" numeric(12, 3),
	"reference" numeric(12, 3),
	"rate" numeric(8, 3),
	"reference_weeks" smallint,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"seen_by" uuid,
	CONSTRAINT "loss_alerts_subject_key" UNIQUE("kind","production_week_id","scope","subject_key")
);
--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_alerts" ADD CONSTRAINT "loss_alerts_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_alerts" ADD CONSTRAINT "loss_alerts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_alerts" ADD CONSTRAINT "loss_alerts_seen_by_users_id_fk" FOREIGN KEY ("seen_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loss_alerts_week_idx" ON "loss_alerts" USING btree ("production_week_id");--> statement-breakpoint
CREATE INDEX "loss_alerts_team_idx" ON "loss_alerts" USING btree ("team_id");--> statement-breakpoint
-- Seuils décidés le 16/11/2026 (docs/PHASE6.md) : +50 %, 5 kg, 3 semaines de suite, tendance stable sous 10 %.
INSERT INTO "alert_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
