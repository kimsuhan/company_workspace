import { and, desc, eq, notInArray } from "drizzle-orm";
import cron from "node-cron";

import { getDb } from "../../common/db.js";
import { githubReviewPullRequests } from "../../common/schema.js";
import {
  getGithubBackoffUntil,
  getGithubReviewSearchQuery,
  getGithubToken,
  mapGithubSearchItemToReviewPullRequest,
} from "./github-review-prs.helper.js";
import type { GithubPullRequestResponse, GithubSearchItem, GithubSearchResponse, PollState, ReviewPullRequest } from "./github-review-prs.type.js";

const GITHUB_SEARCH_URL = "https://api.github.com/search/issues";
const SSE_HEARTBEAT_MS = 25_000;

const pollState: PollState = { isPolling: false };
const sseClients = new Set<ReadableStreamDefaultController<string>>();

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
  return Promise.all(
    data.items.map(async (item) =>
      mapGithubSearchItemToReviewPullRequest(item, await fetchGithubPullRequestBranchName(item, headers)),
    ),
  );
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
    branchName: row.branchName,
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
          branchName: pullRequest.branchName,
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

export function createReviewPullRequestEventStream(): ReadableStream<string> {
  let client: ReadableStreamDefaultController<string> | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  return new ReadableStream<string>({
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
}

async function fetchGithubPullRequestBranchName(item: GithubSearchItem, headers: Headers): Promise<string | null> {
  if (!item.pull_request?.url) {
    return null;
  }

  const detailHeaders = new Headers(headers);
  detailHeaders.delete("if-none-match");

  const response = await fetch(item.pull_request.url, { headers: detailHeaders });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GithubPullRequestResponse;
  return data.head?.ref?.trim() || null;
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
