// check-pr-reviews/index.ts

import process from 'node:process';
import { debug } from 'debug';
import { setFailed } from '@actions/core';

import { approvedReviews, haveAllReviewersReviewed, publishCommentAndRemovePrevious } from '../github-api';
const PULL_REQUEST_MESSAGE_KEYWORD = 'PR review status ';

const log = debug('check-pr-reviews');
export async function main(): Promise<void | boolean> {
  log('Action start');

  const allReviewersHaveReviewed = await haveAllReviewersReviewed();
  if (allReviewersHaveReviewed > 0) {
    await publishCommentAndRemovePrevious(
      `:x: PR review status - has ${allReviewersHaveReviewed} reviewer/s outstanding`,
      PULL_REQUEST_MESSAGE_KEYWORD
    );
    setFailed('PR has not been reviewed correctly - has reviewers outstanding');
    throw new Error('PR has not been reviewed correctly');
  }

  const reviews = await approvedReviews();

  if (reviews.approvedReviews < reviews.totalReviewers) {
    await publishCommentAndRemovePrevious(
      `:x: PR review status - not all reviewers have approved ${reviews.approvedReviews} / ${reviews.totalReviewers}`,
      PULL_REQUEST_MESSAGE_KEYWORD
    );
    setFailed('PR has not been reviewed correctly - not all reviewers have approved');
    throw new Error('PR has not been reviewed correctly - not all reviewers have approved');
  }

  await publishCommentAndRemovePrevious(
    ':white_check_mark: PR review status - All reviews completed and approved!',
    PULL_REQUEST_MESSAGE_KEYWORD
  );
}

main()
  .then(() => {
    process.stdin.destroy();
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(0);
  })
  // eslint-disable-next-line unicorn/prefer-top-level-await
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.log('Action Error - exit 1 - error:', error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
