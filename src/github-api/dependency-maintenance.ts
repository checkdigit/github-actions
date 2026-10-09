// github-api/dependency-maintenance.ts
/* eslint-disable camelcase -- GitHub API parameters use snake_case. */
// github-api/dependency-maintenance.ts

import { Octokit } from '@octokit/rest';

export type API = Octokit;
export interface Repo {
  owner: string;
  repo: string;
}
export const MARKER = '<!-- checkdigit:dependency-maintenance:v1 -->';
const NOT_FOUND = 404;
export const DAY: number = 24 * 60 * 60 * 1000;

export function rankContributors(
  commits: { author: { login?: string; type?: string } | null }[],
): string[] {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const author = commit.author;
    if (
      author?.type === 'User' &&
      author.login !== undefined &&
      !author.login.endsWith('[bot]')
    ) {
      counts.set(author.login, (counts.get(author.login) ?? 0) + 1);
    }
  }
  return [...counts]
    .toSorted(
      ([left, countLeft], [right, countRight]) =>
        countRight - countLeft || left.localeCompare(right),
    )
    .map(([login]) => login);
}

export function positiveDays(value: string, fallback: number): number {
  const days = value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error('Day counts must be positive integers.');
  }
  return days;
}

export async function findAssignee(
  api: API,
  repo: Repo,
  branch: string,
  days: number,
  fallback: string,
): Promise<string | undefined> {
  const commits = await api.paginate(api.rest.repos.listCommits, {
    ...repo,
    sha: branch,
    since: new Date(Date.now() - days * DAY).toISOString(),
    per_page: 100,
  });
  const candidates = [
    ...new Set([
      ...rankContributors(commits),
      ...(fallback === '' ? [] : [fallback]),
    ]),
  ];
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Check ranked candidates in order.
      await api.rest.issues.checkUserCanBeAssigned({
        ...repo,
        assignee: candidate,
      });
      return candidate;
    } catch (error) {
      if ((error as { status?: number }).status !== NOT_FOUND) {
        throw error;
      }
    }
  }
  return undefined;
}

export function isDependencyIssue(
  issue: { title?: string; body?: string | null; pull_request?: unknown },
  title: string,
): boolean {
  return (
    issue.pull_request === undefined &&
    (issue.title?.trim().toLowerCase() === title.trim().toLowerCase() ||
      issue.body?.includes(MARKER) === true)
  );
}

export interface MaintenanceIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  state_reason?: string | null;
  closed_at?: string | null;
  html_url: string;
  pull_request?: unknown;
}

export function maintenanceHistory(
  issues: MaintenanceIssue[],
  title: string,
): { open: MaintenanceIssue | undefined; completedAt: number | undefined } {
  const matched = issues.filter((issue) => isDependencyIssue(issue, title));
  const open = matched.find((issue) => issue.state === 'open');
  const dates = matched
    .filter(
      (issue) =>
        issue.state === 'closed' &&
        issue.state_reason === 'completed' &&
        issue.closed_at !== null &&
        issue.closed_at !== undefined,
    )
    .map((issue) => Date.parse(issue.closed_at ?? ''))
    .filter(Number.isFinite);
  return {
    open,
    completedAt: dates.length === 0 ? undefined : Math.max(...dates),
  };
}

export interface MaintenanceOptions {
  maxAgeDays: number;
  contributorLookbackDays: number;
  fallbackAssignee: string;
  command: string;
  issueTitle: string;
}

export async function checkDependencyMaintenance(
  api: API,
  repo: Repo,
  options: MaintenanceOptions,
): Promise<string | undefined> {
  const issues = await api.paginate(api.rest.issues.listForRepo, {
    ...repo,
    state: 'all',
    per_page: 100,
  });
  const history = maintenanceHistory(issues, options.issueTitle);
  if (history.open !== undefined) {
    return history.open.html_url;
  }
  if (
    history.completedAt !== undefined &&
    Date.now() - history.completedAt < options.maxAgeDays * DAY
  ) {
    return undefined;
  }
  const { data: repo_ } = await api.rest.repos.get({ ...repo });
  const assignee = await findAssignee(
    api,
    repo,
    repo_.default_branch,
    options.contributorLookbackDays,
    options.fallbackAssignee,
  );
  const assignment =
    assignee === undefined
      ? 'No eligible assignee was found.'
      : `Assigned to @${assignee} based on recent eligible contributors, with configured fallback if needed.`;
  const reason =
    history.completedAt === undefined
      ? 'No completed dependency-update issue was found.'
      : `The latest completed dependency-update issue was closed more than ${options.maxAgeDays} days ago.`;
  const { data: issue } = await api.rest.issues.create({
    ...repo,
    title: options.issueTitle,
    body: `${MARKER}\n${reason}\n\nAn authorized repository collaborator can comment exactly \`${options.command}\` to prepare an update PR.\n\n${assignment}\n\nPR assignees will match this issue. Assignees choose reviewers when checks pass and the PR is ready.`,
    assignees: assignee === undefined ? [] : [assignee],
  });
  return issue.html_url;
}

/* eslint-enable camelcase */
