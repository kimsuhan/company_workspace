import type { GithubSearchItem, ReviewPullRequest } from "./github-review-prs.type.js";

const DEFAULT_SEARCH_QUERY = "is:pr is:open user-review-requested:@me archived:false";

export function getGithubToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.GITHUB_TOKEN?.trim();

  if (!token) {
    throw new Error("GITHUB_TOKEN is required");
  }

  return token;
}

export function getGithubReviewSearchQuery(env: NodeJS.ProcessEnv = process.env): string {
  return env.GITHUB_REVIEW_SEARCH_QUERY?.trim() || DEFAULT_SEARCH_QUERY;
}

export function mapGithubSearchItemToReviewPullRequest(
  item: GithubSearchItem,
  branchName: string | null = null,
): ReviewPullRequest {
  return {
    githubIssueId: item.id,
    repo: item.repository_url.replace("https://api.github.com/repos/", ""),
    number: item.number,
    title: item.title,
    url: item.html_url,
    branchName,
    author: item.user?.login ?? "unknown",
    status: item.draft ? "Draft" : "Review",
    isDraft: item.draft ?? false,
    isActive: true,
    githubUpdatedAt: new Date(item.updated_at).toISOString(),
  };
}

export function getGithubBackoffUntil(headers: Headers, now = Date.now()): Date | undefined {
  const retryAfter = Number(headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return new Date(now + retryAfter * 1000);
  }

  const resetAt = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    return new Date(resetAt * 1000);
  }

  return undefined;
}
