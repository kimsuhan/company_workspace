CREATE TABLE "workspace_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slack_user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_users_slack_user_id_unique" ON "workspace_users" USING btree ("slack_user_id");--> statement-breakpoint
CREATE INDEX "workspace_users_active_idx" ON "workspace_users" USING btree ("is_active","name");
