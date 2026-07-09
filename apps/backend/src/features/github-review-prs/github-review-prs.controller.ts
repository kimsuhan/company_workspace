import type { Hono } from "hono";

import { createReviewPullRequestEventStream, listReviewPullRequests } from "./github-review-prs.service.js";

export function registerGithubReviewPrRoutes(app: Hono): void {
  app.get("/github/review-prs", async (c) => c.json(await listReviewPullRequests()));
  app.get("/github/review-prs/events", () => {
    return new Response(createReviewPullRequestEventStream(), {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
}
