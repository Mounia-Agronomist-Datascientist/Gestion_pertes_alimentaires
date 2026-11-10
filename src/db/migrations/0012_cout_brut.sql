ALTER TABLE "loss_declarations" ADD COLUMN "packaging_cost_eur" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "labour_cost_eur" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "indirect_cost_eur" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "gross_cost_eur" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "cost_method" text;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "cost_computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "cost_details" jsonb;