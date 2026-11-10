ALTER TABLE "loss_declarations" ADD COLUMN "cost_per_kg_eur" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "cost_per_unit_eur" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "material_cost_eur" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "cost_import_id" uuid;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_cost_import_id_weekly_imports_id_fk" FOREIGN KEY ("cost_import_id") REFERENCES "public"."weekly_imports"("id") ON DELETE no action ON UPDATE no action;