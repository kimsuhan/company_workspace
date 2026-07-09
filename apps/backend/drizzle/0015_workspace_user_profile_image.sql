ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "profile_image_file_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_users_profile_image_file_id_files_id_fk'
  ) THEN
    ALTER TABLE "workspace_users" ADD CONSTRAINT "workspace_users_profile_image_file_id_files_id_fk" FOREIGN KEY ("profile_image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
