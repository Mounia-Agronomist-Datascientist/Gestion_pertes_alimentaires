CREATE TYPE "public"."price_source" AS ENUM('tome', 'bon_commande', 'manuel');--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"source" "price_source" NOT NULL,
	"valid_from" date NOT NULL,
	"unit" text,
	"unit_weight_g" numeric(12, 3),
	"per_kg_eur" numeric(12, 4),
	"per_unit_eur" numeric(12, 4),
	"weekly_import_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_known" CHECK ("product_prices"."per_kg_eur" is not null or "product_prices"."per_unit_eur" is not null),
	CONSTRAINT "product_prices_positive" CHECK (("product_prices"."per_kg_eur" is null or "product_prices"."per_kg_eur" >= 0) and ("product_prices"."per_unit_eur" is null or "product_prices"."per_unit_eur" >= 0))
);
--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_weekly_import_id_weekly_imports_id_fk" FOREIGN KEY ("weekly_import_id") REFERENCES "public"."weekly_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_version_key" ON "product_prices" USING btree ("product_id","source","valid_from");--> statement-breakpoint
CREATE INDEX "product_prices_product_idx" ON "product_prices" USING btree ("product_id","valid_from");