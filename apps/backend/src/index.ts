import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { closeDatabase, getPostgresClient, migrateDatabase } from "./db.js";
import { registerFileRoutes, startFileCleanup } from "./files.js";
import { registerGithubReviewPrRoutes, startGithubReviewPrPolling } from "./github-review-prs.js";
import { registerNoteRoutes } from "./notes.js";
import { registerProjectRoutes, startProjectHealthPolling } from "./projects.js";
import { registerSlackListRoutes, startSlackListPolling } from "./slack-lists.js";
import { registerTodoRoutes } from "./todos.js";

try {
  process.loadEnvFile?.();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

const app = new Hono();

app.use("/*", async (c, next) => {
  await next();

  if (c.req.header("access-control-request-private-network") === "true") {
    c.res.headers.set("access-control-allow-private-network", "true");
  }
});
app.use(
  "/*",
  cors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:13000",
  }),
);

app.get("/", (c) => c.json({ ok: true, service: "backend" }));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/health/db", async (c) => {
  await getPostgresClient()`select 1`;
  return c.json({ ok: true, database: "postgresql" });
});
registerGithubReviewPrRoutes(app);
registerFileRoutes(app);
registerNoteRoutes(app);
registerTodoRoutes(app);
registerProjectRoutes(app);
registerSlackListRoutes(app);

const port = Number(process.env.PORT ?? 13001);

await migrateDatabase();

const stopGithubReviewPrPolling = startGithubReviewPrPolling();
const stopProjectHealthPolling = startProjectHealthPolling();
const stopFileCleanup = startFileCleanup();
const stopSlackListPolling = startSlackListPolling();

serve({
  fetch: app.fetch,
  port,
});

console.log(`Backend running on http://localhost:${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    stopGithubReviewPrPolling();
    stopProjectHealthPolling();
    stopFileCleanup();
    stopSlackListPolling();
    await closeDatabase();
    process.exit(0);
  });
}
