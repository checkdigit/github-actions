// github-api/index.ts
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { debug } from 'debug';
import { Octokit } from '@octokit/rest';

const THROW_UNABLE_TO_GET_CONTEXT = 'unable to get context';
const THROW_ACTION_ERROR_MESSAGE = 'incorrect action configuration';

export interface GithubConfigurationResponse {
  owner: string;
  number: number;
  repo: string;
}
const log = debug('publish-beta:github');

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

export async function publishCommentAndRemovePrevious(
  message: string,
  prefixOfPreviousMessageToRemove?: string
): Promise<void> {
  if (!process.env['GITHUB_TOKEN']) {
    log('publishCommentAndRemovePrevious: GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokat = new Octokit({ auth: process.env['GITHUB_TOKEN'] });
  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('publishCommentAndRemovePrevious: Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
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
      // if (comment.body?.includes('Beta Published - Install Command: ')) {
      if (prefixOfPreviousMessageToRemove && comment.body?.includes(prefixOfPreviousMessageToRemove)) {
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
    body: message,
    // body: `Beta Published - Install Command: \`npm install ${newBetaVersion}\` `.replaceAll('"', ''),
  });
}

async function haveAllReviewersReviewed(): Promise<boolean> {
  if (!process.env['GITHUB_TOKEN']) {
    log('GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokat = new Octokit({ auth: process.env['GITHUB_TOKEN'] });

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
  }

  // list status of all reviews
  const requestedReviewers = await octokat.rest.pulls.listRequestedReviewers({
    owner: githubContext.owner,
    repo: githubContext.repo,
    // eslint-disable-next-line camelcase
    pull_number: githubContext.number,
  });
  return requestedReviewers.data.users.length <= 0;
}

async function allReviewsPassed(): Promise<boolean> {
  if (!process.env['GITHUB_TOKEN']) {
    log('GITHUB_TOKEN is not set - check action configuration');
    throw new Error(THROW_ACTION_ERROR_MESSAGE);
  }
  const octokat = new Octokit({ auth: process.env['GITHUB_TOKEN'] });

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('Error - unable to get github context');
    throw new Error(THROW_UNABLE_TO_GET_CONTEXT);
  }

  // list status of all reviews
  const requestedReviewers = await octokat.rest.pulls.listReviews({
    owner: githubContext.owner,
    repo: githubContext.repo,
    // eslint-disable-next-line camelcase
    pull_number: githubContext.number,
  });

  if (requestedReviewers.data.length === 0) {
    log('No reviews on this PR');
    return false;
  }

  const pullRequestState = await octokat.rest.pulls.get({
    owner: githubContext.owner,
    repo: githubContext.repo,
    // eslint-disable-next-line camelcase
    pull_number: githubContext.number,
  });
  const reviewState: { [user: string]: string[] } = {};

  for (const review of requestedReviewers.data) {
    if (!review?.user?.login) {
      return false;
    }
    // skip if the user is the one who created the PR makes a comment - that is not a review
    if (pullRequestState?.data?.user?.login === review.user.login && review.state === 'COMMENTED') {
      continue;
    }

    const userState = reviewState[review.user.login];
    if (userState) {
      userState.push(review.state);
    } else {
      reviewState[review.user.login] = [review.state];
    }
  }

  return Object.keys(reviewState).every((user) => {
    const reviews = reviewState[user];
    return reviews && reviews.includes('APPROVED');
  });
}

export async function reviewedCorrectly(): Promise<boolean> {
  const allReviewersReviewed = await haveAllReviewersReviewed();
  if (!allReviewersReviewed) {
    log('Not all reviewers have reviewed');
    return false;
  }

  const allReviewsHavePassed = await allReviewsPassed();
  if (!allReviewsHavePassed) {
    log('Not all reviews have passed');
    return false;
  }
  return true;
}
