import type { Hono } from "hono";
import { and, desc, eq, notInArray } from "drizzle-orm";
import cron from "node-cron";

import { getDb } from "./db.js";
import { githubReviewPullRequests } from "./schema.js";

const DEFAULT_SEARCH_QUERY = "is:pr is:open user-review-requested:@me archived:false";
const GITHUB_SEARCH_URL = "https://api.github.com/search/issues";

type GithubSearchItem = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: { login: string } | null;
  draft?: boolean;
  updated_at: string;
};

type GithubSearchResponse = {
  items: GithubSearchItem[];
};

export type ReviewPullRequest = {
  githubIssueId: number;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  status: string;
  isDraft: boolean;
  isActive: boolean;
  githubUpdatedAt: string;
};

type PollState = {
  etag?: string;
  backoffUntil?: Date;
  isPolling: boolean;
};

const pollState: PollState = { isPolling: false };
const sseClients = new Set<ReadableStreamDefaultController<string>>();
const SSE_HEARTBEAT_MS = 25_000;

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
): ReviewPullRequest {
  return {
    githubIssueId: item.id,
    repo: item.repository_url.replace("https://api.github.com/repos/", ""),
    number: item.number,
    title: item.title,
    url: item.html_url,
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

export async function fetchGithubReviewPullRequests(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReviewPullRequest[] | undefined> {
  const url = new URL(GITHUB_SEARCH_URL);
  url.searchParams.set("q", getGithubReviewSearchQuery(env));
  url.searchParams.set("per_page", "100");

  const headers = new Headers({
    accept: "application/vnd.github+json",
    authorization: `Bearer ${getGithubToken(env)}`,
    "x-github-api-version": "2022-11-28",
  });

  if (pollState.etag) {
    headers.set("if-none-match", pollState.etag);
  }

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    return undefined;
  }

  if (response.status === 403 || response.status === 429) {
    pollState.backoffUntil = getGithubBackoffUntil(response.headers);
    throw new Error(`GitHub API rate limited: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status}`);
  }

  pollState.etag = response.headers.get("etag") ?? undefined;

  const data = (await response.json()) as GithubSearchResponse;
  return data.items.map(mapGithubSearchItemToReviewPullRequest);
}

export async function listReviewPullRequests(): Promise<ReviewPullRequest[]> {
  const rows = await getDb()
    .select()
    .from(githubReviewPullRequests)
    .orderBy(desc(githubReviewPullRequests.lastSeenAt));

  return rows.map((row) => ({
    githubIssueId: row.githubIssueId,
    repo: row.repo,
    number: row.number,
    title: row.title,
    url: row.url,
    author: row.author,
    status: row.status,
    isDraft: row.isDraft,
    isActive: row.isActive,
    githubUpdatedAt: row.githubUpdatedAt.toISOString(),
  }));
}

export async function saveReviewPullRequests(
  pullRequests: ReviewPullRequest[],
): Promise<ReviewPullRequest[]> {
  const db = getDb();
  const now = new Date();
  const activeIds = pullRequests.map((pullRequest) => pullRequest.githubIssueId);

  for (const pullRequest of pullRequests) {
    await db
      .insert(githubReviewPullRequests)
      .values({
        ...pullRequest,
        githubUpdatedAt: new Date(pullRequest.githubUpdatedAt),
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: githubReviewPullRequests.githubIssueId,
        set: {
          repo: pullRequest.repo,
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.url,
          author: pullRequest.author,
          status: pullRequest.status,
          isDraft: pullRequest.isDraft,
          isActive: true,
          lastSeenAt: now,
          githubUpdatedAt: new Date(pullRequest.githubUpdatedAt),
        },
      });
  }

  if (activeIds.length > 0) {
    await db
      .update(githubReviewPullRequests)
      .set({ isActive: false, lastSeenAt: now })
      .where(
        and(
          eq(githubReviewPullRequests.isActive, true),
          notInArray(githubReviewPullRequests.githubIssueId, activeIds),
        ),
      );
  } else {
    await db
      .update(githubReviewPullRequests)
      .set({ isActive: false, lastSeenAt: now })
      .where(eq(githubReviewPullRequests.isActive, true));
  }

  return listReviewPullRequests();
}

export async function pollGithubReviewPullRequests(): Promise<void> {
  if (pollState.isPolling) {
    return;
  }

  if (pollState.backoffUntil && pollState.backoffUntil.getTime() > Date.now()) {
    return;
  }

  pollState.isPolling = true;

  try {
    const pullRequests = await fetchGithubReviewPullRequests();

    if (!pullRequests) {
      return;
    }

    broadcastReviewPullRequests(await saveReviewPullRequests(pullRequests));
  } finally {
    pollState.isPolling = false;
  }
}

export function startGithubReviewPrPolling(): () => void {
  const task = cron.schedule("* * * * *", () => {
    pollGithubReviewPullRequests().catch((error: unknown) => {
      console.error(error);
    });
  });

  pollGithubReviewPullRequests().catch((error: unknown) => {
    console.error(error);
  });

  return () => task.stop();
}

export function registerGithubReviewPrRoutes(app: Hono): void {
  app.get("/github/review-prs", async (c) => c.json(await listReviewPullRequests()));
  app.get("/github/review-prs/events", async () => {
    let client: ReadableStreamDefaultController<string> | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    const stream = new ReadableStream<string>({
      async start(controller) {
        client = controller;
        sseClients.add(controller);
        controller.enqueue("retry: 5000\n\n");
        controller.enqueue(`data: ${JSON.stringify(await listReviewPullRequests())}\n\n`);
        heartbeat = setInterval(() => {
          controller.enqueue(": ping\n\n");
        }, SSE_HEARTBEAT_MS);
      },
      cancel() {
        if (client) {
          sseClients.delete(client);
        }

        if (heartbeat) {
          clearInterval(heartbeat);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
}

function broadcastReviewPullRequests(pullRequests: ReviewPullRequest[]): void {
  const message = `data: ${JSON.stringify(pullRequests)}\n\n`;

  for (const client of sseClients) {
    try {
      client.enqueue(message);
    } catch {
      sseClients.delete(client);
    }
  }
}
