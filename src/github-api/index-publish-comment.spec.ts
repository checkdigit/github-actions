// github-api/index-publish-comment.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import gitHubNock, { createGithubEventFile } from '../nocks/github.test.ts';
import { publishCommentAndRemovePrevious } from './index.ts';

describe('github publish', async () => {
  it('no token', async () => {
    // eslint-disable-next-line @checkdigit/require-assert-predicate-rejects-throws
    await assert.rejects(publishCommentAndRemovePrevious(crypto.randomUUID(), crypto.randomUUID()));
  });

  it('no event path', async () => {
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    // eslint-disable-next-line @checkdigit/require-assert-predicate-rejects-throws
    await assert.rejects(publishCommentAndRemovePrevious(crypto.randomUUID(), crypto.randomUUID()));
  });

  it('publish comment - no existing comments', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/nocomments';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    await publishCommentAndRemovePrevious(crypto.randomUUID(), crypto.randomUUID());
    assert.ok(true);
  });

  it('publish comment - with existing comments', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/comments';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile();
    await publishCommentAndRemovePrevious(crypto.randomUUID(), crypto.randomUUID());
    assert.ok(true);
  });
});
