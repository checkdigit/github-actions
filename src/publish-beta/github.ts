// publish-beta/github.ts
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { debug } from 'debug';
import { Octokit } from '@octokit/rest';

export interface GithubConfigurationResponse {
  owner: string;
  number: number;
  repo: string;
}
const log = debug('action:github');

export function getPRNumber(): string {
  const prNumberSearch = process.env['GITHUB_REF']?.match(/[0-9]+/gu);
  if (!prNumberSearch || prNumberSearch[0] === undefined) {
    log('unable to get PR number - Is process.env.GITHUB_REF set correctly?');
    throw new Error('unable to get PR number');
  }
  return prNumberSearch[0];
}

export async function getPullRequestContext(): Promise<GithubConfigurationResponse | undefined> {
  try {
    log('getGithubContext Path:', process.env['GITHUB_EVENT_PATH']);
    const gitContextFile = await readFile(process.env['GITHUB_EVENT_PATH'] ?? '', { encoding: 'utf8' });
    const payload = JSON.parse(gitContextFile) as {
      issue?: { number: number };
      pull_request?: { number: number };
      number?: { number: number };
    };
    const gitHubRepo = process.env?.['GITHUB_REPOSITORY'] ?? '';
    const [owner, repo] = gitHubRepo.split('/');
    if (!owner || !repo) {
      log('Unable to find repo: Context File', JSON.stringify(gitContextFile));
      throw new Error('unable to get repo');
    }
    const number = (payload.issue || payload.pull_request || payload).number as number;
    return { owner, repo, number };
  } catch {
    log('Throw - getGithubContext - returning undefined');
    return undefined;
  }
}

export async function publishComment(newBetaVersion: string): Promise<void> {
  if (!process.env['GITHUB_TOKEN']) {
    log('GITHUB_TOKEN is not set - check action configuration');
    throw new Error('incorrect action configuration');
  }
  const octokat = new Octokit({ auth: process.env['GITHUB_TOKEN'] });
  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('Error - unable to get github context');
    throw new Error('unable to get context');
  }
  let prComments;
  try {
    prComments = await octokat.rest.issues.listComments({
      // eslint-disable-next-line camelcase
      issue_number: githubContext.number,
      owner: githubContext.owner,
      repo: githubContext.repo,
    });
  } catch (error) {
    log('Error thrown - unable to listComments', error);
  }

  if (prComments && prComments.data) {
    for (const comment of prComments.data) {
      if (comment.body?.includes('Beta Published - Install Command: ')) {
        log('Comment removed');
        // eslint-disable-next-line no-await-in-loop
        await octokat.rest.issues.deleteComment({
          // eslint-disable-next-line camelcase
          comment_id: comment?.id,
          owner: githubContext.owner,
          repo: githubContext.repo,
        });
      }
    }
  }

  log('Creating issue');
  await octokat.rest.issues.createComment({
    // eslint-disable-next-line camelcase
    issue_number: githubContext.number,
    owner: githubContext.owner,
    repo: githubContext.repo,
    body: `Beta Published - Install Command: \`npm install ${newBetaVersion}\` `.replaceAll('"', ''),
  });
}
