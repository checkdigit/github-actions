// github-api/index-reviews.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { differenceInCalendarDays } from '@checkdigit/time';

import gitHubNock, { createGithubEventFile } from '../nocks/github.test.ts';
import { approvedReviews, haveAllReviewersReviewed } from './index.ts';

describe('github review', async () => {
  it('review two outstanding reviewers', async () => {
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/previewOutstanding';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    const result = await haveAllReviewersReviewed();
    assert.equal(result, 2);
  });

  it('No outstanding reviewers and all approved reviews', async () => {
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/preview';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    const result = await approvedReviews();
    assert.equal(result.approvedReviews, 2);
    assert.equal(result.totalReviewers, 2);
  });

  it('Ensure reviews arent stale', async () => {
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/previewOldReviews';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    const result = await approvedReviews();
    assert.equal(result.approvedReviews, 3);
    assert.equal(result.totalReviewers, 3);
    assert.equal(result.oldestApprovedReviewDate, '2023-10-01T01:03:30Z');

    // Ensure the oldest review is more than 90 days old
    const daysSinceOldestApprovedReview = differenceInCalendarDays(
      new Date().toISOString(),
      result.oldestApprovedReviewDate,
    );
    assert.ok(daysSinceOldestApprovedReview > 90);
  });
});
