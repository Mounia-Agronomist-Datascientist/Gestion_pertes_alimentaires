CREATE TABLE "labour_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"hourly_cost_eur" numeric(10, 2) NOT NULL,
	"unit" text DEFAULT 'heure' NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labour_rates_zone_valid_from_key" UNIQUE("zone_id","valid_from"),
	CONSTRAINT "labour_rates_positive" CHECK ("labour_rates"."hourly_cost_eur" >= 0),
	CONSTRAINT "labour_rates_period" CHECK ("labour_rates"."valid_to" is null or "labour_rates"."valid_to" >= "labour_rates"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "labour_rates" ADD CONSTRAINT "labour_rates_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_rates" ADD CONSTRAINT "labour_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;