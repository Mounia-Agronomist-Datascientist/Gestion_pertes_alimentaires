CREATE TABLE "alchimistes_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"collected_on" date NOT NULL,
	"production_week_id" uuid NOT NULL,
	"container_type" text,
	"container_number" text,
	"net_kg" numeric(10, 3) NOT NULL,
	"quality" smallint,
	"incident" text,
	"material" text,
	"file_week" text,
	"replaced_by_import_id" uuid,
	CONSTRAINT "alchimistes_collections_weight" CHECK ("alchimistes_collections"."net_kg" >= 0)
);
--> statement-breakpoint
CREATE TABLE "alchimistes_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"collections" integer NOT NULL,
	"total_kg" numeric(12, 3) NOT NULL,
	"deliveries" integer DEFAULT 0 NOT NULL,
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alchimistes_imports_period" CHECK ("alchimistes_imports"."period_to" >= "alchimistes_imports"."period_from")
);
--> statement-breakpoint
ALTER TABLE "alchimistes_collections" ADD CONSTRAINT "alchimistes_collections_import_id_alchimistes_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."alchimistes_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alchimistes_collections" ADD CONSTRAINT "alchimistes_collections_production_week_id_production_weeks_id_fk" FOREIGN KEY ("production_week_id") REFERENCES "public"."production_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alchimistes_collections" ADD CONSTRAINT "alchimistes_collections_replaced_by_import_id_alchimistes_imports_id_fk" FOREIGN KEY ("replaced_by_import_id") REFERENCES "public"."alchimistes_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alchimistes_imports" ADD CONSTRAINT "alchimistes_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alchimistes_collections_week_idx" ON "alchimistes_collections" USING btree ("production_week_id");--> statement-breakpoint
CREATE INDEX "alchimistes_collections_date_idx" ON "alchimistes_collections" USING btree ("collected_on");