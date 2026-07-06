import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findNewActiveReviewPullRequests,
  findNewlyUnhealthySites,
} from "./dashboard-notifications.js";

test("findNewActiveReviewPullRequests returns active PRs missing from the baseline", () => {
  assert.deepEqual(
    findNewActiveReviewPullRequests(
      new Set([1]),
      [
        { githubIssueId: 1, isActive: true, repo: "acme/web", number: 1, title: "Old" },
        { githubIssueId: 2, isActive: true, repo: "acme/api", number: 2, title: "New" },
        { githubIssueId: 3, isActive: false, repo: "acme/app", number: 3, title: "Handled" },
      ],
    ),
    [{ githubIssueId: 2, isActive: true, repo: "acme/api", number: 2, title: "New" }],
  );
});

test("findNewlyUnhealthySites returns healthy to unhealthy transitions only", () => {
  assert.deepEqual(
    findNewlyUnhealthySites(
      new Map([
        [1, "healthy"],
        [2, "unhealthy"],
        [3, "healthy"],
      ]),
      [
        { id: 1, name: "API", status: "unhealthy" },
        { id: 2, name: "Admin", status: "unhealthy" },
        { id: 3, name: "Docs", status: "healthy" },
        { id: 4, name: "New Service", status: "unhealthy" },
      ],
    ),
    [{ id: 1, name: "API", status: "unhealthy" }],
  );
});
