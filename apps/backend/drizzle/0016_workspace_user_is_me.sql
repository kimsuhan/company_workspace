ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "is_me" boolean DEFAULT false NOT NULL;
