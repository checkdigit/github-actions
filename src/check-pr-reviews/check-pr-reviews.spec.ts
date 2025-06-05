// check-pr-reviews/check-pr-reviews.spec.ts

import { strict as assert } from 'node:assert';

import { describe, it } from '@jest/globals';

import gitHubNock, { createGithubEventFile } from '../nocks/github.test';
import checkPRReviews from './check-pr-reviews';

describe('check pr reviews', () => {
  gitHubNock();
  it('Test basic patch', async () => {
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/previewOldReviews';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();

    // ensure it throws with the correct error
    await assert.rejects(checkPRReviews(), /PR has stale review/u);
  });
});
