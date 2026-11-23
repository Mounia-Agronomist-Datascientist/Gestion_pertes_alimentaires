ALTER TABLE "products" ADD COLUMN "to_validate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "manual_supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "entered_by" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "to_validate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_manual_supplier_id_suppliers_id_fk" FOREIGN KEY ("manual_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;