ALTER TABLE "loss_declarations" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loss_declarations" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "loss_declarations_client_id_key" ON "loss_declarations" USING btree ("client_id") WHERE "loss_declarations"."client_id" is not null;