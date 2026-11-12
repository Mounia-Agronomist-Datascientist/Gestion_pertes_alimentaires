ALTER TABLE "destinations" ADD COLUMN "bin_number_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "declaration_destinations" ADD COLUMN "bin_number" text;--> statement-breakpoint
UPDATE "destinations" SET "bin_number_required" = true WHERE "code" = 'ALCHIMISTES';
