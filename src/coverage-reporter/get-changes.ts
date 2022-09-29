// coverage-reporter/get-changes.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import { setFailed } from '@actions/core';
import type { context, getOctokit } from '@actions/github';
import type { Options } from './options';

export async function getChangedFiles(
  githubClient: ReturnType<typeof getOctokit>,
  options: Options,
  githubContext: typeof context
): Promise<string[]> {
  if (!options.commit || !options.baseCommit) {
    setFailed(`The base and head commits are missing from the payload for this ${githubContext.eventName} event.`);
  }

  const response = await githubClient.rest.repos.compareCommits({
    base: options.baseCommit as string,
    head: options.commit,
    owner: githubContext.repo.owner,
    repo: githubContext.repo.repo,
  });

  // eslint-disable-next-line no-magic-numbers
  if (response.status !== 200) {
    setFailed(
      `The GitHub API for comparing the base and head commits for this ${githubContext.eventName} event returned ${
        response.status as string
      }, expected 200.`
    );
  }

  return (response.data.files ?? [])
    .filter((file) => file.status === 'modified' || file.status === 'added')
    .map((file) => file.filename);
}
