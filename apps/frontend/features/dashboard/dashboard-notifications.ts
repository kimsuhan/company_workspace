type ReviewPullRequestAlertInput = {
  githubIssueId: number;
  isActive: boolean;
  repo: string;
  number: number;
  title: string;
};

type HealthSiteAlertInput = {
  id: number;
  name: string;
  status: "healthy" | "unhealthy";
};

export function findNewActiveReviewPullRequests<T extends ReviewPullRequestAlertInput>(
  previousActiveIds: Set<number>,
  pullRequests: T[],
): T[] {
  return pullRequests.filter((pullRequest) => pullRequest.isActive && !previousActiveIds.has(pullRequest.githubIssueId));
}

export function findNewlyUnhealthySites<T extends HealthSiteAlertInput>(
  previousStatuses: Map<number, HealthSiteAlertInput["status"]>,
  sites: T[],
): T[] {
  return sites.filter((site) => site.status === "unhealthy" && previousStatuses.get(site.id) === "healthy");
}

export function toActiveReviewPullRequestIds(pullRequests: ReviewPullRequestAlertInput[]): Set<number> {
  return new Set(
    pullRequests
      .filter((pullRequest) => pullRequest.isActive)
      .map((pullRequest) => pullRequest.githubIssueId),
  );
}

export function toHealthSiteStatusMap(
  sites: HealthSiteAlertInput[],
): Map<number, HealthSiteAlertInput["status"]> {
  return new Map(sites.map((site) => [site.id, site.status]));
}
