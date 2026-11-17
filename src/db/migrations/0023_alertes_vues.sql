CREATE TABLE "loss_alert_views" (
	"alert_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loss_alert_views_alert_id_user_id_pk" PRIMARY KEY("alert_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "loss_alert_views" ADD CONSTRAINT "loss_alert_views_alert_id_loss_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."loss_alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_alert_views" ADD CONSTRAINT "loss_alert_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;