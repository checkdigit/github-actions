// check-pr-reviews/index.ts

import process from 'node:process';
import { debug } from 'debug';
import { setFailed } from '@actions/core';

import { approvedReviews, haveAllReviewersReviewed, publishCommentAndRemovePrevious } from '../github-api';
const PULL_REQUEST_MESSAGE_PREFIX = 'PR review status ';

const log = debug('check-pr-reviews');
export async function main(): Promise<void | boolean> {
  log('Action start');

  const allReviewersHaveReviewed = await haveAllReviewersReviewed();
  if (allReviewersHaveReviewed > 0) {
    await publishCommentAndRemovePrevious(
      `PR review status - has ${allReviewersHaveReviewed} reviewer/s outstanding :x:`,
      PULL_REQUEST_MESSAGE_PREFIX
    );
    setFailed('PR has not been reviewed correctly - has reviewers outstanding');
    throw new Error('PR has not been reviewed correctly');
  }

  const reviews = await approvedReviews();

  if (reviews.approvedReviews < reviews.totalReviewers) {
    await publishCommentAndRemovePrevious(
      `PR review status - not all reviewers have approved ${reviews.approvedReviews} / ${reviews.totalReviewers} :x:`,
      PULL_REQUEST_MESSAGE_PREFIX
    );
    setFailed('PR has not been reviewed correctly - not all reviewers have approved');
    throw new Error('PR has not been reviewed correctly - not all reviewers have approved');
  }

  await publishCommentAndRemovePrevious(
    'PR review status - All reviews completed and approved! :white_check_mark:',
    PULL_REQUEST_MESSAGE_PREFIX
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
