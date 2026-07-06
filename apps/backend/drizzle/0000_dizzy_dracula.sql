CREATE TABLE "github_review_pull_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_issue_id" bigint NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"author" text NOT NULL,
	"status" text NOT NULL,
	"is_draft" boolean NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"github_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_review_pull_requests_github_issue_id_unique" UNIQUE("github_issue_id")
);
