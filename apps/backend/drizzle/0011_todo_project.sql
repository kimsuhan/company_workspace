ALTER TABLE "todo_memos" ADD COLUMN "project_id" integer;
--> statement-breakpoint
INSERT INTO "projects" ("name", "description")
SELECT 'Inbox', 'Default project for existing todos'
WHERE EXISTS (SELECT 1 FROM "todo_memos")
  AND NOT EXISTS (SELECT 1 FROM "projects" WHERE "is_active" = true);
--> statement-breakpoint
UPDATE "todo_memos"
SET "project_id" = (
  SELECT "id"
  FROM "projects"
  WHERE "is_active" = true
  ORDER BY "created_at", "id"
  LIMIT 1
)
WHERE "project_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "todo_memos" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "todo_memos" ADD CONSTRAINT "todo_memos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "todo_memos_project_id_idx" ON "todo_memos" USING btree ("project_id");
