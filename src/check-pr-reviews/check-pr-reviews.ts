// check-pr-reviews/check-pr-reviews.ts

import debug from 'debug';
import { setFailed } from '@actions/core';

import { differenceInCalendarDays } from '@checkdigit/time';

import { approvedReviews, haveAllReviewersReviewed, publishCommentAndRemovePrevious } from '../github-api/index.ts';

const MAXIMUM_DAYS_SINCE_REVIEW = 90;
const PULL_REQUEST_MESSAGE_KEYWORD = 'PR review status ';
const log = debug('github-actions:check-pr-reviews');

export default async function (): Promise<void> {
  log('Action start');

  const yetToReview = await haveAllReviewersReviewed();
  if (yetToReview > 0) {
    const reviewOutstandingMessage =
      yetToReview === 1 ? `has ${yetToReview} reviewer outstanding` : `has ${yetToReview} reviewers outstanding`;
    await publishCommentAndRemovePrevious(
      `:x: PR review status - ${reviewOutstandingMessage}`,
      PULL_REQUEST_MESSAGE_KEYWORD,
    );
    setFailed(`PR has not been reviewed correctly - ${reviewOutstandingMessage}`);
    throw new Error(`PR has not been reviewed correctly - ${reviewOutstandingMessage}`);
  }

  const reviews = await approvedReviews();

  if (reviews.approvedReviews < reviews.totalReviewers) {
    const approvedReviewsOutstandingMessage =
      reviews.totalReviewers === 1
        ? `reviewer has not approved`
        : `not all reviewers have approved - ${reviews.approvedReviews} approved - ${
            reviews.totalReviewers - reviews.approvedReviews
          } outstanding`;

    await publishCommentAndRemovePrevious(
      `:x: PR review status - ${approvedReviewsOutstandingMessage}`,
      PULL_REQUEST_MESSAGE_KEYWORD,
    );
    setFailed(`PR has not been reviewed correctly - ${approvedReviewsOutstandingMessage}`);
    throw new Error('PR has not been reviewed correctly - not all reviewers have approved');
  }

  const daysSinceOldestApprovedReview = differenceInCalendarDays(
    new Date().toISOString(),
    reviews.oldestApprovedReviewDate,
  );
  if (Math.abs(daysSinceOldestApprovedReview) > MAXIMUM_DAYS_SINCE_REVIEW) {
    setFailed(`PR has stale review`);
    throw new Error('PR has stale review');
  }

  log('Action end');
}
