ALTER TABLE "loss_declarations" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD CONSTRAINT "loss_declarations_period_start_before" CHECK ("period_start" IS NULL OR ("period_start" < "occurred_on" AND "period_start" >= "occurred_on" - 13));
