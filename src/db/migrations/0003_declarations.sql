CREATE TYPE "public"."declaration_status" AS ENUM('brouillon', 'validee', 'corrigee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."kg_status" AS ENUM('pese', 'converti', 'non_converti', 'sans_objet');--> statement-breakpoint
CREATE TYPE "public"."measurement_method" AS ENUM('pesee', 'estimation_contenant', 'comptage', 'conversion_reference', 'estimation_manuelle');--> statement-breakpoint
CREATE TYPE "public"."responsibility" AS ENUM('equipe', 'zone');--> statement-breakpoint
CREATE TABLE "declaration_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"defaults" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "declaration_containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"container_tare_id" uuid NOT NULL,
	"count" smallint NOT NULL,
	"tare_kg_snapshot" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "declaration_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"net_kg" numeric(12, 4),
	"recovered_amount" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "declaration_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" "declaration_status" NOT NULL,
	"data" jsonb NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	CONSTRAINT "declaration_revisions_declaration_revision_key" UNIQUE("declaration_id","revision")
);
--> statement-breakpoint
CREATE TABLE "loss_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "declaration_status" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"occurred_on" date NOT NULL,
	"occurred_time" time,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"production_week_id" uuid NOT NULL,
	"declared_week_id" uuid NOT NULL,
	"is_late" boolean NOT NULL,
	"zone_id" uuid NOT NULL,
	"subzone_id" uuid NOT NULL,
	"team_id" uuid,
	"responsibility" "responsibility" NOT NULL,
	"created_by" uuid NOT NULL,
	"batch_id" uuid,
	"product_id" uuid,
	"product_unlisted" boolean DEFAULT false NOT NULL,
	"product_category" "product_category" NOT NULL,
	"product_name" text NOT NULL,
	"product_external_id" text,
	"product_code" text,
	"product_variant" text,
	"measurement_method" "measurement_method" NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_code" text NOT NULL,
	"tare_total_kg" numeric(12, 4),
	"net_quantity" numeric(12, 4) NOT NULL,
	"net_unit_code" text NOT NULL,
	"net_kg" numeric(12, 4),
	"kg_status" "kg_status" NOT NULL,
	"conversion_factor_used" numeric(12, 4),
	"cause_id" uuid NOT NULL,
	"cause_name" text NOT NULL,
	"comment" text,
	"destination_gap_justification" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loss_declarations_quantity_positive" CHECK ("loss_declarations"."quantity" > 0 and "loss_declarations"."net_quantity" > 0),
	CONSTRAINT "loss_declarations_team_matches_responsibility" CHECK (("loss_declarations"."responsibility" = 'equipe') = ("loss_declarations"."team_id" is not null)),
	CONSTRAINT "loss_declarations_product_reference" CHECK (("loss_declarations"."product_id" is not null) or "loss_declarations"."product_unlisted")
);
--> statement-breakpoint
ALTER TABLE "declaration_batches" ADD CONSTRAINT "declaration_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_containers" ADD CONSTRAINT "declaration_containers_declaration_id_loss_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."loss_declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_containers" ADD CONSTRAINT "declaration_containers_container_tare_id_container_tares_id_fk" FOREIGN KEY ("container_tare_id") REFERENCES "public"."container_tares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_destinations" ADD CONSTRAINT "declaration_destinations_declaration_id_loss_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."loss_declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_destinations" ADD CONSTRAINT "declaration_destinations_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_revisions" ADD CONSTRAINT "declaration_revisions_declaration_id_loss_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."loss_declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_revisions" ADD CONSTRAINT "declaration_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_declared_week_id_production_weeks_id_fk" FOREIGN KEY ("declared_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_subzone_id_subzones_id_fk" FOREIGN KEY ("subzone_id") REFERENCES "public"."subzones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_batch_id_declaration_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."declaration_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_unit_code_units_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_net_unit_code_units_code_fk" FOREIGN KEY ("net_unit_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_cause_id_causes_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."causes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loss_declarations_week_team_idx" ON "loss_declarations" USING btree ("production_week_id","team_id");--> statement-breakpoint
CREATE INDEX "loss_declarations_zone_week_idx" ON "loss_declarations" USING btree ("zone_id","production_week_id");--> statement-breakpoint
CREATE INDEX "loss_declarations_cause_idx" ON "loss_declarations" USING btree ("cause_id");--> statement-breakpoint
CREATE INDEX "loss_declarations_product_idx" ON "loss_declarations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "loss_declarations_created_by_idx" ON "loss_declarations" USING btree ("created_by");