CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"color" text DEFAULT '#f4b400' NOT NULL,
	"note_date" date,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notes_kind_archived_updated_idx" ON "notes" USING btree ("kind","is_archived","updated_at");
--> statement-breakpoint
CREATE INDEX "notes_note_date_idx" ON "notes" USING btree ("note_date");
