CREATE TABLE "chat_usage" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
