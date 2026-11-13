CREATE TYPE "public"."ingredient_mapping_status" AS ENUM('famille', 'non_couvert', 'non_alimentaire');--> statement-breakpoint
CREATE TABLE "ingredient_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_key" text NOT NULL,
	"label" text NOT NULL,
	"status" "ingredient_mapping_status" NOT NULL,
	"family_id" uuid,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_families_key" UNIQUE("ingredient_key"),
	CONSTRAINT "ingredient_families_family_iff_status" CHECK (("ingredient_families"."status" = 'famille') = ("ingredient_families"."family_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "ingredient_families" ADD CONSTRAINT "ingredient_families_family_id_food_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."food_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_families" ADD CONSTRAINT "ingredient_families_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;