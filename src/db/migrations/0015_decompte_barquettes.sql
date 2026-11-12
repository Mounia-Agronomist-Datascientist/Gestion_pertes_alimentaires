CREATE TABLE "production_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_id" uuid NOT NULL,
	"code" text NOT NULL,
	"made_barquettes" integer NOT NULL,
	CONSTRAINT "production_count_lines_count_code_key" UNIQUE("count_id","code"),
	CONSTRAINT "production_count_lines_positive" CHECK ("production_count_lines"."made_barquettes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_week_id" uuid NOT NULL,
	"version" smallint NOT NULL,
	"status" "weekly_import_status" DEFAULT 'validee' NOT NULL,
	"file_name" text NOT NULL,
	"sheet_name" text NOT NULL,
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp with time zone,
	CONSTRAINT "production_counts_week_version_key" UNIQUE("production_week_id","version")
);
--> statement-breakpoint
ALTER TABLE "production_count_lines" ADD CONSTRAINT "production_count_lines_count_id_production_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."production_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_counts" ADD CONSTRAINT "production_counts_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_counts" ADD CONSTRAINT "production_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_counts_one_valid_per_week" ON "production_counts" USING btree ("production_week_id") WHERE "production_counts"."status" = 'validee';