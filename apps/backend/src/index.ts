import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { closeDatabase, getPostgresClient, migrateDatabase } from "./common/db.js";
import { registerFileRoutes } from "./features/files/files.controller.js";
import { startFileCleanup } from "./features/files/files.service.js";
import { registerGithubReviewPrRoutes } from "./features/github-review-prs/github-review-prs.controller.js";
import { startGithubReviewPrPolling } from "./features/github-review-prs/github-review-prs.service.js";
import { registerNoteRoutes } from "./features/notes/notes.controller.js";
import { registerProjectRoutes } from "./features/projects/projects.controller.js";
import { startProjectHealthPolling } from "./features/projects/projects.service.js";
import { registerSlackListRoutes } from "./features/slack-lists/slack-lists.controller.js";
import { startSlackListPolling } from "./features/slack-lists/slack-lists.service.js";
import { registerTodoRoutes } from "./features/todos/todos.controller.js";
import { registerWorkspaceUserRoutes } from "./features/workspace-users/workspace-users.controller.js";

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
registerWorkspaceUserRoutes(app);
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
