import assert from "node:assert/strict";
import { test } from "node:test";

import { getDatabaseUrl, getMigrationsFolder } from "./db.js";

test("getDatabaseUrl requires DATABASE_URL", () => {
  assert.throws(
    () => getDatabaseUrl({}),
    /DATABASE_URL is required/,
  );
});

test("getDatabaseUrl returns DATABASE_URL", () => {
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }),
    "postgresql://user:pass@localhost:5432/app",
  );
});

test("getMigrationsFolder resolves drizzle folder from src", () => {
  assert.match(
    getMigrationsFolder(new URL("file:///workspace/apps/backend/src/db.ts")),
    /\/workspace\/apps\/backend\/drizzle$/,
  );
});

test("getMigrationsFolder resolves drizzle folder from dist", () => {
  assert.match(
    getMigrationsFolder(new URL("file:///workspace/apps/backend/dist/db.js")),
    /\/workspace\/apps\/backend\/drizzle$/,
  );
});
