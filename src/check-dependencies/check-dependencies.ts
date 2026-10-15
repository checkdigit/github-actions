// check-dependencies/check-dependencies.ts

import debug from 'debug';
import { getInput, setOutput, warning } from '@actions/core';
import { Octokit } from '@octokit/rest';

const log = debug('github-actions:check-dependencies');
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_DAYS = 90;
const ISSUE_TITLE = 'Update dependencies';
const ISSUE_LABEL = 'DEPENDENCY UPDATE';
const ISSUE_MARKER = '<!-- check-dependencies -->';
const LEGACY_ISSUE_TITLES = [
  // Match "update dependencies" and "update to latest dependencies", allowing suffixes.
  /^update\s+(?:(?:to\s+)?(?:the\s+)?latest\s+)?dependencies\b/iu,
  // Match "dependency updates" and "dependency / CI updates", allowing date suffixes.
  /^dependenc(?:y|ies)(?:\s*\/\s*ci)?\s+updates?\b/iu,
];
const MAX_DATE_MS = 8.64e15;
const DEFAULT_LOOKBACK_DAYS = 90;
const NOT_FOUND = 404;

function getDaysInput(name: string, defaultValue: number): number {
  const input = getInput(name) || String(defaultValue);
  const days = Number(input);
  if (
    !Number.isSafeInteger(days) ||
    days <= 0 ||
    days * DAY_IN_MS > MAX_DATE_MS
  ) {
    throw new Error(
      `incorrect action configuration: ${name} must be a positive integer number of days`,
    );
  }
  return days;
}

function hasStatus(error: unknown, status: number): boolean {
  return error instanceof Error && 'status' in error && error.status === status;
}

async function selectAssignee(
  octokit: Octokit,
  owner: string,
  repo: string,
  since: string,
  until: string,
): Promise<string | undefined> {
  // Without a sha, GitHub lists commits on the default branch.
  const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner,
    repo,
    since,
    until,
    // eslint-disable-next-line camelcase
    per_page: 100,
  });
  const contributors = new Map<string, { count: number; latest: number }>();
  for (const commit of commits) {
    const author = commit.author;
    const authoredAt = Date.parse(commit.commit.author?.date ?? '');
    if (
      author?.type === 'User' &&
      !author.login.endsWith('[bot]') &&
      authoredAt >= Date.parse(since) &&
      authoredAt <= Date.parse(until)
    ) {
      const login = author.login.toLowerCase();
      const contributor = contributors.get(login) ?? { count: 0, latest: 0 };
      contributor.count += 1;
      contributor.latest = Math.max(contributor.latest, authoredAt);
      contributors.set(login, contributor);
    }
  }
  const candidates = contributors
    .entries()
    .toArray()
    .toSorted(
      ([leftLogin, left], [rightLogin, right]) =>
        right.count - left.count ||
        right.latest - left.latest ||
        leftLogin.localeCompare(rightLogin),
    )
    .map(([login]) => login);
  const fallback = getInput('fallback-assignee').toLowerCase();
  if (fallback !== '' && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }
  for (const assignee of candidates) {
    try {
      // Try candidates in rank order and stop at the first eligible user.
      // eslint-disable-next-line no-await-in-loop
      await octokit.rest.issues.checkUserCanBeAssigned({
        owner,
        repo,
        assignee,
      });
      return assignee;
    } catch (error) {
      if (!hasStatus(error, NOT_FOUND)) {
        throw error;
      }
      log('Skipping ineligible assignee %s', assignee);
    }
  }
  return undefined;
}

export default async function main(): Promise<void> {
  log('Action start');
  setOutput('issue-url', '');
  const maxAgeDays = getDaysInput('max-age-days', MAX_AGE_DAYS);
  const lookbackDays = getDaysInput(
    'contributor-lookback-days',
    DEFAULT_LOOKBACK_DAYS,
  );

  // eslint-disable-next-line n/no-process-env
  const token = process.env['GITHUB_TOKEN'];
  if (token === undefined || token === '') {
    throw new Error('incorrect action configuration: GITHUB_TOKEN is not set');
  }
  const octokit = new Octokit({ auth: token });

  // eslint-disable-next-line n/no-process-env
  const gitHubRepo = process.env['GITHUB_REPOSITORY'] ?? '';
  const [owner, repo, extra] = gitHubRepo.split('/');
  if (
    owner === undefined ||
    owner === '' ||
    repo === undefined ||
    repo === '' ||
    extra !== undefined
  ) {
    throw new Error('unable to get repo');
  }

  const now = Date.now();
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'all',
    // eslint-disable-next-line camelcase
    per_page: 100,
  });
  const maintenanceIssues = issues.filter(
    (issue) =>
      issue.pull_request === undefined &&
      (issue.labels.some(
        (label) =>
          (typeof label === 'string' ? label : label.name)?.toUpperCase() ===
          ISSUE_LABEL,
      ) ||
        LEGACY_ISSUE_TITLES.some((pattern) =>
          pattern.test(issue.title.trim()),
        ) ||
        issue.body?.includes(ISSUE_MARKER) === true),
  );
  if (maintenanceIssues.some((issue) => issue.state === 'open')) {
    log('Dependency maintenance issue already open');
    return;
  }
  let lastCompleted = 0;
  for (const issue of maintenanceIssues) {
    if (issue.state === 'closed' && issue.state_reason === 'completed') {
      lastCompleted = Math.max(
        lastCompleted,
        Date.parse(issue.closed_at ?? '') || 0,
      );
    }
  }
  if (lastCompleted !== 0 && lastCompleted > now - maxAgeDays * DAY_IN_MS) {
    log('Dependency maintenance is not due');
    return;
  }

  const assignee = await selectAssignee(
    octokit,
    owner,
    repo,
    new Date(now - lookbackDays * DAY_IN_MS).toISOString(),
    new Date(now).toISOString(),
  );
  if (assignee === undefined) {
    warning(
      'No eligible recent contributor or fallback assignee; creating an unassigned dependency maintenance issue.',
    );
  }
  const { data: issue } = await octokit.rest.issues.create({
    owner,
    repo,
    title: ISSUE_TITLE,
    labels: [ISSUE_LABEL],
    body: `${ISSUE_MARKER}\n\nupdate to the latest dependencies and workflows`,
    assignees: assignee === undefined ? [] : [assignee],
  });
  setOutput('issue-url', issue.html_url);
  log('Action end: %s', issue.html_url);
}
