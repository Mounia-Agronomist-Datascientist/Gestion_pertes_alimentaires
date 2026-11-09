CREATE TYPE "public"."plan_block" AS ENUM('plats', 'petits_dejeuners');--> statement-breakpoint
CREATE TYPE "public"."weekly_import_status" AS ENUM('validee', 'remplacee');--> statement-breakpoint
CREATE TABLE "week_recipe_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"recipe_id" uuid,
	"sub_recipe_id" uuid,
	"position" smallint NOT NULL,
	"label" text NOT NULL,
	"key" text NOT NULL,
	"is_sub_recipe" boolean NOT NULL,
	"component_sub_recipe_id" uuid,
	"quantity" numeric(12, 4) NOT NULL,
	"unit" text NOT NULL,
	"unit_weight_g" numeric(12, 3),
	"cost_eur" numeric(10, 4),
	CONSTRAINT "week_recipe_lines_one_owner" CHECK (("week_recipe_lines"."recipe_id" is null) <> ("week_recipe_lines"."sub_recipe_id" is null))
);
--> statement-breakpoint
CREATE TABLE "week_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"team_id" uuid,
	"plan_group" text,
	"plan_block" "plan_block",
	"week_barquettes" integer,
	"first_day_barquettes" integer,
	"portion_weight_g" numeric(10, 3),
	"total_weight_g" numeric(12, 3),
	"total_cost_eur" numeric(10, 4),
	CONSTRAINT "week_recipes_import_code_key" UNIQUE("import_id","code")
);
--> statement-breakpoint
CREATE TABLE "week_sub_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"reference_quantity" numeric(12, 3),
	"reference_unit" text,
	"gross_quantity" numeric(12, 3),
	"gross_unit" text,
	"net_quantity" numeric(12, 3),
	"net_unit" text,
	"total_cost_eur" numeric(10, 4),
	CONSTRAINT "week_sub_recipes_import_key_key" UNIQUE("import_id","key")
);
--> statement-breakpoint
CREATE TABLE "weekly_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_week_id" uuid NOT NULL,
	"version" smallint NOT NULL,
	"status" "weekly_import_status" DEFAULT 'validee' NOT NULL,
	"tome_file_name" text NOT NULL,
	"plan_file_name" text NOT NULL,
	"plan_sheet_name" text NOT NULL,
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp with time zone,
	CONSTRAINT "weekly_imports_week_version_key" UNIQUE("production_week_id","version")
);
--> statement-breakpoint
ALTER TABLE "week_recipe_lines" ADD CONSTRAINT "week_recipe_lines_import_id_weekly_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."weekly_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_recipe_lines" ADD CONSTRAINT "week_recipe_lines_recipe_id_week_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."week_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_recipe_lines" ADD CONSTRAINT "week_recipe_lines_sub_recipe_id_week_sub_recipes_id_fk" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."week_sub_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_recipe_lines" ADD CONSTRAINT "week_recipe_lines_component_sub_recipe_id_week_sub_recipes_id_fk" FOREIGN KEY ("component_sub_recipe_id") REFERENCES "public"."week_sub_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_recipes" ADD CONSTRAINT "week_recipes_import_id_weekly_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."weekly_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_recipes" ADD CONSTRAINT "week_recipes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_sub_recipes" ADD CONSTRAINT "week_sub_recipes_import_id_weekly_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."weekly_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_imports" ADD CONSTRAINT "weekly_imports_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_imports" ADD CONSTRAINT "weekly_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "week_recipe_lines_recipe_idx" ON "week_recipe_lines" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "week_recipe_lines_sub_recipe_idx" ON "week_recipe_lines" USING btree ("sub_recipe_id");--> statement-breakpoint
CREATE INDEX "week_recipes_team_idx" ON "week_recipes" USING btree ("import_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_imports_one_valid_per_week" ON "weekly_imports" USING btree ("production_week_id") WHERE "weekly_imports"."status" = 'validee';