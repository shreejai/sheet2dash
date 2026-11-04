CREATE TABLE "dashboard_viewers" (
	"owner_user_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_viewers_owner_user_id_email_pk" PRIMARY KEY("owner_user_id","email")
);
--> statement-breakpoint
CREATE INDEX "dashboard_viewers_email_idx" ON "dashboard_viewers" USING btree ("email");