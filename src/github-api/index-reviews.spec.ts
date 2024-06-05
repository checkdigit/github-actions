// github-api/index-reviews.spec.ts

import { strict as assert } from 'node:assert';

import { describe, it } from '@jest/globals';

import gitHubNock, { createGithubEventFile } from '../nocks/github.test';
import { approvedReviews, haveAllReviewersReviewed } from './index';

describe('github review', () => {
  it('review two outstanding reviewers', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/previewOutstanding';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    const result = await haveAllReviewersReviewed();
    assert.equal(result, 2);
  });

  it('No outstanding reviewers and all approved reviews', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/preview';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    const result = await approvedReviews();
    assert.deepEqual(result, { approvedReviews: 2, totalReviewers: 2 });
  });
});
