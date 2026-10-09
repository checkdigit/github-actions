// github-api/dependency-issue-command.ts
/* eslint-disable camelcase -- GitHub API uses snake_case fields. */

import { Octokit } from '@octokit/rest';

export async function authorizeComment(
  api: Octokit,
  repo: { owner: string; repo: string },
  payload: {
    action?: string;
    issue?: { number: number; pull_request?: unknown };
    comment?: { body: string; user: { login: string; type: string } };
  },
  command: string,
): Promise<number | undefined> {
  if (
    payload.action !== 'created' ||
    payload.issue?.pull_request !== undefined ||
    payload.comment?.body.trim() !== command ||
    payload.comment.user.type !== 'User' ||
    payload.issue === undefined
  ) {
    return undefined;
  }
  const { data: permission } =
    await api.rest.repos.getCollaboratorPermissionLevel({
      ...repo,
      username: payload.comment.user.login,
    });
  if (!['write', 'maintain', 'admin'].includes(permission.permission)) {
    return undefined;
  }
  const { data: issue } = await api.rest.issues.get({
    ...repo,
    issue_number: payload.issue.number,
  });
  if (issue.state !== 'open' || issue.pull_request !== undefined) {
    return undefined;
  }
  return issue.number;
}

/* eslint-enable camelcase */
