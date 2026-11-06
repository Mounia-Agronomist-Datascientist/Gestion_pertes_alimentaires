CREATE TABLE "production_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" smallint NOT NULL,
	"number" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_weeks_year_number_key" UNIQUE("year","number"),
	CONSTRAINT "production_weeks_start_date_key" UNIQUE("start_date"),
	CONSTRAINT "production_weeks_seven_days" CHECK ("production_weeks"."end_date" = "production_weeks"."start_date" + 6),
	CONSTRAINT "production_weeks_starts_thursday" CHECK (extract(isodow from "production_weeks"."start_date") = 4),
	CONSTRAINT "production_weeks_number_range" CHECK ("production_weeks"."number" between 1 and 53)
);
