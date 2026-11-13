CREATE TYPE "public"."emission_factor_status" AS ENUM('propose', 'valide', 'remplace', 'refuse');--> statement-breakpoint
CREATE TABLE "emission_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"version" smallint NOT NULL,
	"status" "emission_factor_status" DEFAULT 'propose' NOT NULL,
	"kg_co2e_per_kg" numeric(10, 4) NOT NULL,
	"source" text NOT NULL,
	"source_version" text,
	"reference_date" date,
	"reference_code" text,
	"reference_name" text,
	"stages" jsonb,
	"hypotheses" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "emission_factors_family_version_key" UNIQUE("family_id","version"),
	CONSTRAINT "emission_factors_positive" CHECK ("emission_factors"."kg_co2e_per_kg" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_families_code_key" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_family_id_food_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."food_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factors_one_valid_per_family" ON "emission_factors" USING btree ("family_id") WHERE "emission_factors"."status" = 'valide';--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factors_one_proposal_per_family" ON "emission_factors" USING btree ("family_id") WHERE "emission_factors"."status" = 'propose';