// github-api/dependency-updates.ts
/* eslint-disable camelcase -- GitHub API uses snake_case fields. */
import { readFile } from 'node:fs/promises';

import { setOutput, summary } from '@actions/core';
import { Octokit } from '@octokit/rest';

import type { Scope } from '../update-dependencies/versions.ts';

export async function publishUpdate(
  api: Octokit,
  repo: { owner: string; repo: string },
  base: string,
  head: string,
  version: string,
  changes: string[],
  scripts: string[],
  options: { scope: Scope; issueNumber: number; label?: string },
): Promise<void> {
  const { scope, issueNumber } = options;
  const branch = 'automation/dependency-updates';
  // Resolve the label before creating the issue or branch.
  const label = options.label ?? 'PATCH';
  await api.rest.issues.getLabel({ ...repo, name: label });
  const title = `Update dependencies (${version})`;
  const details = `${changes.join('\n')}\n\nValidation: ${scripts.join(', ')}.\nScope: ${scope}. Peer dependencies are unchanged.\nLockfile regenerated; transitive dependencies may also change.`;
  const { data: issue } = await api.rest.issues.get({
    ...repo,
    issue_number: issueNumber,
  });
  await api.rest.git.createRef({
    ...repo,
    ref: `refs/heads/${branch}`,
    sha: head,
  });
  // GitHub signs API-created bot commits; do not supply custom identity/signature.
  const result = await api.graphql<{
    createCommitOnBranch: { commit: { oid: string } };
  }>(
    `mutation($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) { commit { oid } }
    }`,
    {
      input: {
        branch: {
          repositoryNameWithOwner: `${repo.owner}/${repo.repo}`,
          branchName: branch,
        },
        expectedHeadOid: head,
        message: { headline: title, body: `Refs #${issue.number}` },
        fileChanges: {
          additions: await Promise.all(
            ['package.json', 'package-lock.json'].map(async (file) => ({
              path: file,
              contents: Buffer.from(await readFile(file)).toString('base64'),
            })),
          ),
        },
      },
    },
  );
  const { data: commit } = await api.rest.repos.getCommit({
    ...repo,
    ref: result.createCommitOnBranch.commit.oid,
  });
  if (commit.commit.verification?.verified !== true) {
    throw new Error(
      `Commit is not verified. Inspect ${branch} and issue #${issue.number}; no PR was opened.`,
    );
  }
  const { data: pull } = await api.rest.pulls.create({
    ...repo,
    head: branch,
    base,
    title,
    body: `Closes #${issue.number}\n\n${details}\n\nReview, squash merge, and release manually.`,
  });
  await api.rest.issues.addLabels({
    ...repo,
    issue_number: pull.number,
    labels: [label],
  });
  if (
    issue.assignees !== undefined &&
    issue.assignees !== null &&
    issue.assignees.length > 0
  ) {
    await api.rest.issues.addAssignees({
      ...repo,
      issue_number: pull.number,
      assignees: issue.assignees.map((assignee) => assignee.login),
    });
  }
  await api.rest.issues.createComment({
    ...repo,
    issue_number: issue.number,
    body: `Update PR: ${pull.html_url}\n\nAssignees: choose reviewers once checks pass and the PR is ready.`,
  });
  setOutput('issue-url', issue.html_url);
  setOutput('pull-request-url', pull.html_url);
  await summary
    .addLink('Dependency update PR', pull.html_url)
    .addRaw(`\n\n${details}\n`)
    .write();
}

export async function getDefaultBranch(
  api: Octokit,
  repo: { owner: string; repo: string },
): Promise<string> {
  const { data } = await api.rest.repos.get({ ...repo });
  return data.default_branch;
}

export async function getExistingDependencyPR(
  api: Octokit,
  repo: { owner: string; repo: string },
): Promise<string | undefined> {
  const { data } = await api.rest.pulls.list({
    ...repo,
    state: 'open',
    head: `${repo.owner}:automation/dependency-updates`,
  });
  return data[0]?.html_url;
}

export async function assertUpdateBranchAvailable(
  api: Octokit,
  repo: { owner: string; repo: string },
): Promise<void> {
  const NOT_FOUND = 404;
  try {
    await api.rest.git.getRef({
      ...repo,
      ref: 'heads/automation/dependency-updates',
    });
    throw new Error(
      'Delete the stale automation/dependency-updates branch before starting another update.',
    );
  } catch (error) {
    if ((error as { status?: number }).status !== NOT_FOUND) {
      throw error;
    }
  }
}

export async function publishDependencyComment(
  api: Octokit,
  repo: { owner: string; repo: string },
  number: number,
  body: string,
): Promise<void> {
  await api.rest.issues.createComment({ ...repo, issue_number: number, body });
}

export async function completeDependencyIssue(
  api: Octokit,
  repo: { owner: string; repo: string },
  number: number,
): Promise<void> {
  await publishDependencyComment(
    api,
    repo,
    number,
    'No eligible direct dependency updates were found for the configured scope.',
  );
  await api.rest.issues.update({
    ...repo,
    issue_number: number,
    state: 'closed',
    state_reason: 'completed',
  });
}

export async function verifyDefaultBranch(
  api: Octokit,
  repo: { owner: string; repo: string },
  base: string,
  head: string,
): Promise<void> {
  const { data } = await api.rest.git.getRef({ ...repo, ref: `heads/${base}` });
  if (data.object.sha !== head) {
    throw new Error('The default branch changed during validation. Run again.');
  }
}

/* eslint-enable camelcase */
