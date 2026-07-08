CREATE TABLE "slack_settings" (
  "id" integer DEFAULT 1 PRIMARY KEY NOT NULL,
  "bot_token" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "slack_settings_singleton_id" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE TABLE "slack_list_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "list_id" text NOT NULL,
  "field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "filter_config" jsonb DEFAULT '{"all":[]}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_sync_at" timestamp with time zone,
  "sync_backoff_until" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "slack_list_sources_active_idx" ON "slack_list_sources" USING btree ("is_active","updated_at");
--> statement-breakpoint
CREATE TABLE "slack_list_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_id" integer NOT NULL,
  "slack_item_id" text NOT NULL,
  "title" text NOT NULL,
  "mapped_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "raw_item" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "slack_created_at" timestamp with time zone,
  "slack_updated_at" timestamp with time zone,
  CONSTRAINT "slack_list_items_source_id_slack_list_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."slack_list_sources"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "slack_list_items_source_item_unique" ON "slack_list_items" USING btree ("source_id","slack_item_id");
--> statement-breakpoint
CREATE INDEX "slack_list_items_source_active_idx" ON "slack_list_items" USING btree ("source_id","is_active","last_seen_at");
