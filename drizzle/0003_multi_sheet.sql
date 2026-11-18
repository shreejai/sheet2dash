-- Several sheets per user. Hand-edited from the generated version so existing
-- rows are kept: each user's one connection becomes kind "orders", and their
-- dashboard layout and viewers are linked to it.

-- sheet_connections: many per user, one per (user, file), with a kind.
ALTER TABLE "sheet_connections" DROP CONSTRAINT "sheet_connections_user_id_unique";--> statement-breakpoint
ALTER TABLE "sheet_connections" ADD COLUMN "kind" text DEFAULT 'orders' NOT NULL;--> statement-breakpoint
ALTER TABLE "sheet_connections" ADD CONSTRAINT "sheet_connections_user_sheet_unique" UNIQUE("user_id","spreadsheet_id");--> statement-breakpoint

-- dashboards: keyed by connection instead of user.
ALTER TABLE "dashboards" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
UPDATE "dashboards" AS d SET "connection_id" = c."id" FROM "sheet_connections" AS c WHERE c."user_id" = d."user_id";--> statement-breakpoint
DELETE FROM "dashboards" WHERE "connection_id" IS NULL;--> statement-breakpoint
ALTER TABLE "dashboards" ALTER COLUMN "connection_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboards" DROP CONSTRAINT "dashboards_user_id_unique";--> statement-breakpoint
ALTER TABLE "dashboards" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_connection_id_unique" UNIQUE("connection_id");--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_connection_id_sheet_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."sheet_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- dashboard_viewers: shared per connection instead of per owner.
ALTER TABLE "dashboard_viewers" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
UPDATE "dashboard_viewers" AS v SET "connection_id" = c."id" FROM "sheet_connections" AS c WHERE c."user_id" = v."owner_user_id";--> statement-breakpoint
DELETE FROM "dashboard_viewers" WHERE "connection_id" IS NULL;--> statement-breakpoint
ALTER TABLE "dashboard_viewers" ALTER COLUMN "connection_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_viewers" DROP CONSTRAINT "dashboard_viewers_owner_user_id_email_pk";--> statement-breakpoint
ALTER TABLE "dashboard_viewers" DROP COLUMN "owner_user_id";--> statement-breakpoint
ALTER TABLE "dashboard_viewers" ADD CONSTRAINT "dashboard_viewers_connection_id_email_pk" PRIMARY KEY("connection_id","email");--> statement-breakpoint
ALTER TABLE "dashboard_viewers" ADD CONSTRAINT "dashboard_viewers_connection_id_sheet_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."sheet_connections"("id") ON DELETE cascade ON UPDATE no action;
