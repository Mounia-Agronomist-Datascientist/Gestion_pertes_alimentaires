CREATE TABLE "manual_packagings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_code" text,
	"packaging_label" text NOT NULL,
	"content_quantity" numeric(12, 3),
	"content_unit" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_packagings_content_positive" CHECK ("manual_packagings"."content_quantity" is null or "manual_packagings"."content_quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "manual_packagings" ADD CONSTRAINT "manual_packagings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_packagings" ADD CONSTRAINT "manual_packagings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_packagings" ADD CONSTRAINT "manual_packagings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_packagings_product_supplier_key" ON "manual_packagings" USING btree ("product_id","supplier_id");