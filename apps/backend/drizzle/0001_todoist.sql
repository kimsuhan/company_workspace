CREATE TABLE "todo_memos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"color" text DEFAULT '#1c69d4' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "todo_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"todo_memo_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_todo_memo_id_todo_memos_id_fk" FOREIGN KEY ("todo_memo_id") REFERENCES "public"."todo_memos"("id") ON DELETE cascade ON UPDATE no action;
