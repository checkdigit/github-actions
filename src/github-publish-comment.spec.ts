// github-publish-comment.spec.ts

import { strict as assert } from 'node:assert';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { v4 as uuid } from 'uuid';

import gitHubNock from './nocks/github.test';
import { publishComment } from './github';

describe('github publish', () => {
  beforeAll(async () => mkdir(path.join(tmpdir(), 'actionpublishcommenttest')));
  afterAll(async () => rmdir(path.join(tmpdir(), 'actionpublishcommenttest'), { recursive: true }));

  it('no token', async () => {
    await assert.rejects(publishComment(uuid()));
  });

  it('no event path', async () => {
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    await assert.rejects(publishComment(uuid()));
  });

  it('publish comment - no existing comments', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/nocomments';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    const filePath = path.join(tmpdir(), 'actionpublishcommenttest', uuid());
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
    await publishComment(uuid());
    assert(true);
  });

  it('publish comment - with existing comments', async () => {
    // setGlobalDispatcher(gitHubNock);
    gitHubNock();
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/comments';
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';
    const filePath = path.join(tmpdir(), 'actionpublishcommenttest', uuid());
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
    await publishComment(uuid());
    assert(true);
  });
});
