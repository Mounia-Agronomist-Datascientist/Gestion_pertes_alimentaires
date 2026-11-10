CREATE TYPE "public"."packaging_kind" AS ENUM('barquette', 'film', 'etiquette', 'moule', 'plat', 'gastro', 'autre');--> statement-breakpoint
CREATE TYPE "public"."portion_kind" AS ENUM('plat', 'petit_dejeuner');--> statement-breakpoint
CREATE TABLE "packaging_item_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_cost_eur" numeric(12, 5) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packaging_item_costs_item_valid_from_key" UNIQUE("item_id","valid_from"),
	CONSTRAINT "packaging_item_costs_positive" CHECK ("packaging_item_costs"."unit_cost_eur" >= 0),
	CONSTRAINT "packaging_item_costs_period" CHECK ("packaging_item_costs"."valid_to" is null or "packaging_item_costs"."valid_to" >= "packaging_item_costs"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "packaging_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "packaging_kind" NOT NULL,
	"unit" text NOT NULL,
	"supplier" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packaging_items_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "packaging_per_portion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portion_kind" "portion_kind" NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(10, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packaging_per_portion_kind_item_key" UNIQUE("portion_kind","item_id"),
	CONSTRAINT "packaging_per_portion_positive" CHECK ("packaging_per_portion"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "packaging_item_costs" ADD CONSTRAINT "packaging_item_costs_item_id_packaging_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."packaging_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging_item_costs" ADD CONSTRAINT "packaging_item_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging_per_portion" ADD CONSTRAINT "packaging_per_portion_item_id_packaging_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."packaging_items"("id") ON DELETE no action ON UPDATE no action;