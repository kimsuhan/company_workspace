import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getGithubBackoffUntil,
  getGithubReviewSearchQuery,
  mapGithubSearchItemToReviewPullRequest,
} from "./github-review-prs.js";

test("getGithubReviewSearchQuery defaults to direct review requests", () => {
  assert.equal(
    getGithubReviewSearchQuery({}),
    "is:pr is:open user-review-requested:@me archived:false",
  );
});

test("getGithubReviewSearchQuery trims configured query", () => {
  assert.equal(
    getGithubReviewSearchQuery({ GITHUB_REVIEW_SEARCH_QUERY: "  is:pr org:acme  " }),
    "is:pr org:acme",
  );
});

test("mapGithubSearchItemToReviewPullRequest maps GitHub search items", () => {
  assert.deepEqual(
    mapGithubSearchItemToReviewPullRequest({
      id: 123,
      number: 42,
      title: "Fix dashboard",
      html_url: "https://github.com/acme/web/pull/42",
      pull_request: { url: "https://api.github.com/repos/acme/web/pulls/42" },
      repository_url: "https://api.github.com/repos/acme/web",
      user: { login: "octocat" },
      draft: false,
      updated_at: "2026-07-03T10:00:00Z",
    }, "feature/dashboard"),
    {
      githubIssueId: 123,
      repo: "acme/web",
      number: 42,
      title: "Fix dashboard",
      url: "https://github.com/acme/web/pull/42",
      branchName: "feature/dashboard",
      author: "octocat",
      status: "Review",
      isDraft: false,
      isActive: true,
      githubUpdatedAt: "2026-07-03T10:00:00.000Z",
    },
  );
});

test("getGithubBackoffUntil prefers retry-after seconds", () => {
  assert.equal(
    getGithubBackoffUntil(
      new Headers({
        "retry-after": "5",
        "x-ratelimit-reset": "1783072810",
      }),
      1_783_072_800_000,
    )?.toISOString(),
    "2026-07-03T10:00:05.000Z",
  );
});

test("getGithubBackoffUntil falls back to x-ratelimit-reset seconds", () => {
  assert.equal(
    getGithubBackoffUntil(
      new Headers({
        "x-ratelimit-reset": "1783072810",
      }),
      1_783_072_800_000,
    )?.toISOString(),
    "2026-07-03T10:00:10.000Z",
  );
});
