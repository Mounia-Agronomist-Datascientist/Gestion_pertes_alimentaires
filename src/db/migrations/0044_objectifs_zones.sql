CREATE TABLE "zone_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"max_kg_per_week" numeric(10, 1) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_targets_zone_valid_from_key" UNIQUE("zone_id","valid_from"),
	CONSTRAINT "zone_targets_positive" CHECK ("zone_targets"."max_kg_per_week" >= 0),
	CONSTRAINT "zone_targets_period" CHECK ("zone_targets"."valid_to" is null or "zone_targets"."valid_to" >= "zone_targets"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "zone_targets" ADD CONSTRAINT "zone_targets_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_targets" ADD CONSTRAINT "zone_targets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;