// github-api/index-reviews.spec.ts

import { strict as assert } from 'node:assert';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { v4 as uuid } from 'uuid';

import gitHubNock from '../nocks/github.test';
import { approvedReviews, haveAllReviewersReviewed } from './index';

const actionFolderName = 'actionreviewtest';

describe('github review', () => {
  beforeAll(async () => mkdir(path.join(tmpdir(), actionFolderName)));
  afterAll(async () => rm(path.join(tmpdir(), actionFolderName), { recursive: true }));

  it('review two outstanding reviewers', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/prviewOutstanding';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    const filePath = path.join(tmpdir(), actionFolderName, uuid());
    await writeFile(
      filePath,
      JSON.stringify({
        // eslint-disable-next-line camelcase
        pull_request: {
          number: 10,
        },
      })
    );
    process.env['GITHUB_EVENT_PATH'] = filePath;
    const result = await haveAllReviewersReviewed();
    assert.equal(result, 2);
  });

  it('No outstanding reviewers and all approved reviews', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/prview';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    const filePath = path.join(tmpdir(), actionFolderName, uuid());
    await writeFile(
      filePath,
      JSON.stringify({
        // eslint-disable-next-line camelcase
        pull_request: {
          number: 10,
        },
      })
    );
    process.env['GITHUB_EVENT_PATH'] = filePath;
    const result = await approvedReviews();
    assert.deepStrictEqual(result, { approvedReviews: 2, totalReviewers: 2 });
  });
});
