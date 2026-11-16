CREATE TYPE "public"."surplus_entry_kind" AS ENUM('vente', 'versement', 'don');--> statement-breakpoint
CREATE TYPE "public"."surplus_source" AS ENUM('tgtg', 'vente_flash', 'linkee');--> statement-breakpoint
CREATE TABLE "surplus_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"source" "surplus_source" NOT NULL,
	"kind" "surplus_entry_kind" NOT NULL,
	"occurred_on" date NOT NULL,
	"production_week_id" uuid,
	"trays" integer DEFAULT 0 NOT NULL,
	"breakfast_trays" integer DEFAULT 0 NOT NULL,
	"offered_trays" integer,
	"boxes" integer,
	"breakfast_boxes" integer,
	"formula" text,
	"amount_eur" numeric(12, 2),
	"code" text,
	"note" text,
	"dish_name" text,
	"lot" text,
	"dish_code" text,
	"produced_on" date,
	"best_before" date,
	"collected" boolean,
	"week_recipe_id" uuid,
	"net_kg" numeric(12, 3),
	"cost_eur" numeric(12, 2),
	"replaced_by_import_id" uuid,
	CONSTRAINT "surplus_entries_quantities" CHECK ("surplus_entries"."trays" >= 0 and "surplus_entries"."breakfast_trays" >= 0)
);
--> statement-breakpoint
CREATE TABLE "surplus_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "surplus_source" NOT NULL,
	"file_name" text NOT NULL,
	"sheets" text NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"entries" integer NOT NULL,
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surplus_imports_period" CHECK ("surplus_imports"."period_to" >= "surplus_imports"."period_from")
);
--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "declarable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "surplus_entries" ADD CONSTRAINT "surplus_entries_import_id_surplus_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."surplus_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_entries" ADD CONSTRAINT "surplus_entries_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_entries" ADD CONSTRAINT "surplus_entries_week_recipe_id_week_recipes_id_fk" FOREIGN KEY ("week_recipe_id") REFERENCES "public"."week_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_entries" ADD CONSTRAINT "surplus_entries_replaced_by_import_id_surplus_imports_id_fk" FOREIGN KEY ("replaced_by_import_id") REFERENCES "public"."surplus_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_imports" ADD CONSTRAINT "surplus_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "surplus_entries_source_date_idx" ON "surplus_entries" USING btree ("source","occurred_on");--> statement-breakpoint
CREATE INDEX "surplus_entries_week_idx" ON "surplus_entries" USING btree ("production_week_id");--> statement-breakpoint
-- Décision du 13/11/2026 : Too Good To Go et la vente flash ne sont plus déclarés par les équipes (fichiers de l'entreprise).
UPDATE "destinations" SET "declarable" = false, "updated_at" = now() WHERE "code" IN ('TGTG', 'VENTE_FLASH');--> statement-breakpoint
INSERT INTO "destinations" ("code", "name", "kind", "financial_recovery", "declarable", "display_order")
SELECT 'LINKEE', 'Linkee', 'don', false, false, coalesce((SELECT "display_order" FROM "destinations" WHERE "code" = 'DON'), 0)
ON CONFLICT ("code") DO NOTHING;
