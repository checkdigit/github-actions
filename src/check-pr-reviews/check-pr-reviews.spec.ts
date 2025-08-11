// check-pr-reviews/check-pr-reviews.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it, mock } from 'node:test';

import gitHubNock, { createGithubEventFile } from '../nocks/github.test.ts';

describe('check pr reviews', async () => {
  // we have to mock setFailed as it is used in the code to signal failure,
  //  behind the scenes it calls process.exit(1) which marks the test as failed even though it is not
  mock.module('@actions/core', {
    namedExports: {
      setFailed: mock.fn(),
    },
  });
  // must use dynamic import after mocking to ensure the mock is applied
  const { default: checkPRReviews } = await import('./check-pr-reviews.ts');

  gitHubNock();
  it('Test basic patch', async () => {
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/previewOldReviews';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();

    // ensure it throws with the correct error
    await assert.rejects(checkPRReviews(), /PR has stale review/u);
  });
});
