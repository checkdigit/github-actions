// github-api/dependency-client.ts

import { Octokit } from '@octokit/rest';

import { getPullRequestContext } from './index.ts';

export function getDependencyClient(): Octokit {
  // eslint-disable-next-line n/no-process-env -- Match the existing GitHub API helper authentication convention.
  const token = process.env['GITHUB_TOKEN'];
  if (token === undefined || token === '') {
    throw new Error('incorrect action configuration: GITHUB_TOKEN is not set');
  }
  return new Octokit({ auth: token });
}

export async function getDependencyRepo(): Promise<{
  owner: string;
  repo: string;
}> {
  const repo = await getPullRequestContext();
  if (repo === undefined) {
    throw new Error('unable to get context');
  }
  return { owner: repo.owner, repo: repo.repo };
}
