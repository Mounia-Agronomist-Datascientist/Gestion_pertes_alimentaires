CREATE TABLE "cause_subzones" (
	"cause_id" uuid NOT NULL,
	"subzone_id" uuid NOT NULL,
	CONSTRAINT "cause_subzones_cause_id_subzone_id_pk" PRIMARY KEY("cause_id","subzone_id")
);
--> statement-breakpoint
ALTER TABLE "cause_subzones" ADD CONSTRAINT "cause_subzones_cause_id_causes_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."causes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cause_subzones" ADD CONSTRAINT "cause_subzones_subzone_id_subzones_id_fk" FOREIGN KEY ("subzone_id") REFERENCES "public"."subzones"("id") ON DELETE no action ON UPDATE no action;