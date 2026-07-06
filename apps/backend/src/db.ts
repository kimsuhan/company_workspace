import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

let postgresClient: Sql | undefined;
let database: ReturnType<typeof drizzle> | undefined;

export function getPostgresClient(): Sql {
  postgresClient ??= postgres(getDatabaseUrl(), { max: 10 });
  return postgresClient;
}

export function getDb(): ReturnType<typeof drizzle> {
  database ??= drizzle(getPostgresClient());
  return database;
}

export function getMigrationsFolder(moduleUrl: string | URL = import.meta.url): string {
  return join(dirname(dirname(fileURLToPath(moduleUrl))), "drizzle");
}

export async function migrateDatabase(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: getMigrationsFolder() });
}

export async function closeDatabase(): Promise<void> {
  await postgresClient?.end({ timeout: 5 });
  postgresClient = undefined;
  database = undefined;
}
