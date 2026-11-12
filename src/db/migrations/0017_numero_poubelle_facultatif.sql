CREATE TYPE "public"."bin_number_mode" AS ENUM('aucun', 'facultatif', 'obligatoire');--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "bin_number_mode" "bin_number_mode" DEFAULT 'aucun' NOT NULL;--> statement-breakpoint
-- N° de poubelle des Alchimistes facultatif en attendant les n° des bacs collectés (décision du 12/11/2026).
UPDATE "destinations" SET "bin_number_mode" = 'facultatif' WHERE "bin_number_required";--> statement-breakpoint
ALTER TABLE "destinations" DROP COLUMN "bin_number_required";
