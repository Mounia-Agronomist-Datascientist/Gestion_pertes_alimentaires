ALTER TABLE "declaration_containers" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "declaration_destinations" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;