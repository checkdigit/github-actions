// github-api/index.ts
import { readFile } from 'node:fs/promises';

import debug from 'debug';
import { Octokit } from '@octokit/rest';

const THROW_UNABLE_TO_GET_CONTEXT = 'unable to get context';
const THROW_ACTION_ERROR_MESSAGE = 'incorrect action configuration';

export interface GithubConfigurationResponse {
  owner: string;
  number: number;
  repo: string;
}

export interface GithubReviewStatus {
  approvedReviews: number;
  totalReviewers: number;
  oldestApprovedReviewDate: string;
}

export interface RequestedReviewers {
  user?: {
    type?: 'Bot' | 'User';
    login?: string;
  };
  state: string;
  submitted_at: string;
}

export interface PullRequestState {
  user?: {
    login: string;
  };
}

const log = debug('github-actions:publish-beta:github');

export function getPRNumber(): string {
  const prNumberSearch = process.env['GITHUB_REF']?.match(/[0-9]+/gu); // matches the PR number
  if (prNumberSearch?.[0] === undefined) {
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
    const gitHubRepo = process.env['GITHUB_REPOSITORY'] ?? '';
    const [owner, repo] = gitHubRepo.split('/');
    if (owner === undefined || owner === '' || repo === undefined || repo === '') {
      log('Unable to find repo: Context File', JSON.stringify(gitContextFile));
      throw new Error('unable to get repo');
    }
    const number = (payload.issue ?? payload.pull_request ?? payload).number as number;
    return { owner, repo, number };
  } catch {
    log('Throw - getGithubContext - returning undefined');
    return undefined;
  }
}

export async function getFileFromMain(filename: string): Promise<string | undefined> {
  if (process.env['GITHUB_TOKEN'] === undefined || process.env['GITHUB_TOKEN'] === '') {
    log('getFileFromMain - GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokit = new Octokit({ auth: process.env['GITHUB_TOKEN'] });

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('getFileFromMain Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
  }

  // get the labels attached to the PR
  const { data } = (await octokit.rest.repos.getContent({
    owner: githubContext.owner,
    repo: githubContext.repo,
    path: filename,
    ref: 'main',
    mediaType: {
      format: 'raw',
    },
  })) as unknown as { data: string };

  log('getFileFromMain - data', data);

  if (!data) {
    return;
  }
  return data;
}

export async function getLabelsOnPR(): Promise<string[]> {
  if (process.env['GITHUB_TOKEN'] === undefined || process.env['GITHUB_TOKEN'] === '') {
    log('getLabelsOnPR - GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokit = new Octokit({ auth: process.env['GITHUB_TOKEN'] });

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('getLabelsOnPR Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
  }

  const pullRequest = await octokit.rest.pulls.get({
    owner: githubContext.owner,
    repo: githubContext.repo,
    // eslint-disable-next-line camelcase
    pull_number: githubContext.number,
  });

  return pullRequest.data.labels.map((label) => label.name);
}

export async function publishCommentAndRemovePrevious(
  message: string,
  prefixOfPreviousMessageToRemove?: string,
): Promise<void> {
  if (process.env['GITHUB_TOKEN'] === undefined || process.env['GITHUB_TOKEN'] === '') {
    log('publishCommentAndRemovePrevious: GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokit = new Octokit({ auth: process.env['GITHUB_TOKEN'] });
  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('publishCommentAndRemovePrevious: Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
  }
  let prComments;
  try {
    prComments = await octokit.rest.issues.listComments({
      // eslint-disable-next-line camelcase
      issue_number: githubContext.number,
      owner: githubContext.owner,
      repo: githubContext.repo,
    });
  } catch (error) {
    log('Error thrown - unable to listComments', error);
  }

  if (prComments?.data) {
    for (const comment of prComments.data) {
      if (
        prefixOfPreviousMessageToRemove !== undefined &&
        prefixOfPreviousMessageToRemove !== '' &&
        (comment.body === undefined || comment.body.includes(prefixOfPreviousMessageToRemove))
      ) {
        log('Comment removed');
        // eslint-disable-next-line no-await-in-loop
        await octokit.rest.issues.deleteComment({
          // eslint-disable-next-line camelcase
          comment_id: comment.id,
          owner: githubContext.owner,
          repo: githubContext.repo,
        });
      }
    }
  }

  log('Creating issue');
  await octokit.rest.issues.createComment({
    // eslint-disable-next-line camelcase
    issue_number: githubContext.number,
    owner: githubContext.owner,
    repo: githubContext.repo,
    body: message,
  });
}

export async function haveAllReviewersReviewed(): Promise<number> {
  if (process.env['GITHUB_TOKEN'] === undefined || process.env['GITHUB_TOKEN'] === '') {
    log('GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokit = new Octokit({ auth: process.env['GITHUB_TOKEN'] });

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
  }

  // list status of all reviews
  const requestedReviewers = await octokit.rest.pulls.listRequestedReviewers({
    owner: githubContext.owner,
    repo: githubContext.repo,
    // eslint-disable-next-line camelcase
    pull_number: githubContext.number,
  });
  return requestedReviewers.data.users.length;
}

export async function approvedReviews(): Promise<GithubReviewStatus> {
  if (process.env['GITHUB_TOKEN'] === undefined || process.env['GITHUB_TOKEN'] === '') {
    log('GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokit = new Octokit({ auth: process.env['GITHUB_TOKEN'] });

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
  }

  const requestedReviewers: RequestedReviewers[] = await octokit.paginate(
    'GET /repos/{owner}/{repo}/pulls/{number}/reviews',
    {
      owner: githubContext.owner,
      repo: githubContext.repo,
      number: githubContext.number,
    },
  );

  if (requestedReviewers.length === 0) {
    log('No reviews on this PR');
    throw new Error('No reviews on this PR');
  }

  const pullRequestStateRequest: PullRequestState[] = await octokit.paginate(
    'GET /repos/{owner}/{repo}/pulls/{number}',
    {
      owner: githubContext.owner,
      repo: githubContext.repo,
      number: githubContext.number,
    },
  );

  if (pullRequestStateRequest.length !== 1) {
    throw new Error('Unable to get pull request state');
  }
  const pullRequestState = pullRequestStateRequest['0'];

  const reviewState: Record<string, string[]> = {};

  const dateOfApprovedReviews: string[] = [];

  for (const review of requestedReviewers) {
    if (review.user?.login === undefined || review.user.login === '') {
      throw new Error(THROW_ACTION_ERROR_MESSAGE);
    }
    // skip any bots related comments on a PR (such as GitHub advanced security)
    if (review.user.type === 'Bot') {
      // eslint-disable-next-line no-continue
      continue;
    }
    // skip if the user is the one who created the PR makes a comment - that is not a review
    if (pullRequestState?.user?.login === review.user.login && review.state === 'COMMENTED') {
      // eslint-disable-next-line no-continue
      continue;
    }
    const userState = reviewState[review.user.login];
    if (userState) {
      userState.push(review.state);
    } else {
      reviewState[review.user.login] = [review.state];
    }
    if (review.state === 'APPROVED') {
      dateOfApprovedReviews.push(review.submitted_at);
    }
  }

  const oldestApprovedReviewDate = dateOfApprovedReviews.sort()[0];
  if (oldestApprovedReviewDate === undefined) {
    throw new Error('Invalid date received from approved reviews');
  }

  const approvedReviewsList = Object.keys(reviewState).filter((user) => {
    const reviews = reviewState[user];
    return reviews && reviews.includes('APPROVED');
  });

  return {
    approvedReviews: approvedReviewsList.length,
    totalReviewers: Object.keys(reviewState).length,
    oldestApprovedReviewDate,
  };
}
