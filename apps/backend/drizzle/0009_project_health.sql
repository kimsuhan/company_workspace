ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "logo_url" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "logo_file_id" integer;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "logo_variant" text DEFAULT 'black' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "health_api_url" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_health_api_url_unique'
  ) THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_health_api_url_unique" UNIQUE("health_api_url");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_logo_file_id_files_id_fk'
  ) THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_health_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "status" text NOT NULL,
  "checked_at" timestamp with time zone NOT NULL,
  "response_time_ms" integer,
  "status_code" integer,
  "error" text,
  CONSTRAINT "project_health_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_health_records_project_checked_at_idx" ON "project_health_records" USING btree ("project_id","checked_at");
--> statement-breakpoint
DO $$
DECLARE
  old_sites text := 'health' || '_check_sites';
  old_records text := 'health' || '_check_records';
  old_api_column text := 'health' || '_check_url';
  old_site record;
  target_project_id integer;
  old_site_id integer;
BEGIN
  IF to_regclass(old_sites) IS NULL THEN
    RETURN;
  END IF;

  FOR old_site IN EXECUTE format(
    'SELECT id, name, logo_url, logo_file_id, logo_variant, %I AS api_url, is_active, created_at, updated_at FROM %I',
    old_api_column,
    old_sites
  ) LOOP
    SELECT id INTO target_project_id
    FROM projects
    WHERE name = old_site.name AND is_active = true
    ORDER BY id
    LIMIT 1;

    IF target_project_id IS NULL THEN
      INSERT INTO projects (
        name,
        description,
        logo_url,
        logo_file_id,
        logo_variant,
        health_api_url,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        old_site.name,
        NULL,
        old_site.logo_url,
        old_site.logo_file_id,
        COALESCE(old_site.logo_variant, 'black'),
        old_site.api_url,
        old_site.is_active,
        old_site.created_at,
        old_site.updated_at
      )
      RETURNING id INTO target_project_id;
    ELSE
      UPDATE projects
      SET
        logo_url = old_site.logo_url,
        logo_file_id = old_site.logo_file_id,
        logo_variant = COALESCE(old_site.logo_variant, 'black'),
        health_api_url = old_site.api_url,
        updated_at = GREATEST(projects.updated_at, old_site.updated_at)
      WHERE id = target_project_id;
    END IF;

    old_site_id := old_site.id;

    IF to_regclass(old_records) IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO project_health_records (project_id, status, checked_at, response_time_ms, status_code, error)
         SELECT $1, status, checked_at, response_time_ms, status_code, error FROM %I WHERE site_id = $2',
        old_records
      )
      USING target_project_id, old_site_id;
    END IF;
  END LOOP;

  IF to_regclass(old_records) IS NOT NULL THEN
    EXECUTE format('DROP TABLE %I', old_records);
  END IF;

  EXECUTE format('DROP TABLE %I', old_sites);
END $$;
