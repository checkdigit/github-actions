// coverage-reporter/delete-old-comments.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import * as core from '@actions/core';
import type { context, getOctokit } from '@actions/github';

import type { Options } from './options';

const REQUESTED_COMMENTS_PER_PAGE = 20;

async function getExistingComments(
  githubClient: ReturnType<typeof getOctokit>,
  options: Options,
  githubContext: typeof context
): Promise<{ id: number }[]> {
  let page = 0;
  let results: { id: number; user: Record<string, unknown> | null; body?: string }[] = [];
  let finished = false;
  do {
    // eslint-disable-next-line no-await-in-loop
    const response = await githubClient.rest.issues.listComments({
      // eslint-disable-next-line camelcase
      issue_number: githubContext.issue.number,
      owner: githubContext.repo.owner,
      repo: githubContext.repo.repo,
      // eslint-disable-next-line camelcase
      per_page: REQUESTED_COMMENTS_PER_PAGE,
      page,
    });
    results = [...results, ...response.data];
    page++;
    if (response.data.length < REQUESTED_COMMENTS_PER_PAGE) {
      finished = true;
    }
  } while (!finished);

  return results.filter(
    (comment) =>
      Boolean(comment.user) &&
      (!options.title || comment.body?.includes(options.title)) &&
      comment.body?.includes('Coverage Report')
  );
}

export async function deleteOldComments(
  githubClient: ReturnType<typeof getOctokit>,
  options: Options,
  githubContext: typeof context
): Promise<void> {
  const existingComments = await getExistingComments(githubClient, options, githubContext);
  for (const comment of existingComments) {
    core.debug(`Deleting comment: ${comment.id}`);
    try {
      // eslint-disable-next-line no-await-in-loop
      await githubClient.rest.issues.deleteComment({
        owner: githubContext.repo.owner,
        repo: githubContext.repo.repo,
        // eslint-disable-next-line camelcase
        comment_id: comment.id,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }
}
