// github-api/index-publish-comment.spec.ts

import { strict as assert } from 'node:assert';

import { describe, it } from '@jest/globals';
import { v4 as uuid } from 'uuid';

import gitHubNock, { createGithubEventFile } from '../nocks/github.test';
import { publishCommentAndRemovePrevious } from './index';

describe('github publish', () => {
  it('no token', async () => {
    await assert.rejects(publishCommentAndRemovePrevious(uuid(), uuid()));
  });

  it('no event path', async () => {
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    await assert.rejects(publishCommentAndRemovePrevious(uuid(), uuid()));
  });

  it('publish comment - no existing comments', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/nocomments';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    await publishCommentAndRemovePrevious(uuid(), uuid());
    assert(true);
  });

  it('publish comment - with existing comments', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/comments';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    await publishCommentAndRemovePrevious(uuid(), uuid());
    assert(true);
  });
});
