CREATE TABLE "declaration_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"content" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "lots" jsonb;--> statement-breakpoint
ALTER TABLE "declaration_photos" ADD CONSTRAINT "declaration_photos_declaration_id_loss_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."loss_declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_photos" ADD CONSTRAINT "declaration_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "declaration_photos_declaration_idx" ON "declaration_photos" USING btree ("declaration_id");--> statement-breakpoint
CREATE INDEX "declaration_photos_created_at_idx" ON "declaration_photos" USING btree ("created_at");