export type GithubSearchItem = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  pull_request?: { url: string };
  repository_url: string;
  user: { login: string } | null;
  draft?: boolean;
  updated_at: string;
};

export type GithubSearchResponse = {
  items: GithubSearchItem[];
};

export type GithubPullRequestResponse = {
  head?: { ref?: string };
};

export type ReviewPullRequest = {
  githubIssueId: number;
  repo: string;
  number: number;
  title: string;
  url: string;
  branchName: string | null;
  author: string;
  status: string;
  isDraft: boolean;
  isActive: boolean;
  githubUpdatedAt: string;
};

export type PollState = {
  etag?: string;
  backoffUntil?: Date;
  isPolling: boolean;
};
