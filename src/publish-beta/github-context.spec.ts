// publish-beta/github-context.spec.ts

import { strict as assert } from 'node:assert';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { v4 as uuid } from 'uuid';

import { getPullRequestContext } from './github';

describe('github context', () => {
  beforeAll(async () => mkdir(path.join(tmpdir(), 'actioncontexttest')));
  afterAll(async () => rm(path.join(tmpdir(), 'actioncontexttest'), { recursive: true }));

  it('no environment variable', async () => {
    process.env['GITHUB_EVENT_PATH'] = '';
    const result = await getPullRequestContext();
    assert.equal(result, undefined);
  });

  it('unable to open file - file does not exist', async () => {
    process.env['GITHUB_EVENT_PATH'] = path.join(tmpdir(), uuid());
    assert.equal(await getPullRequestContext(), undefined);
  });

  it('standard happy path', async () => {
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/test';
    const filePath = path.join(tmpdir(), 'actioncontexttest', uuid());
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
    assert.deepEqual(await getPullRequestContext(), { owner: 'checkdigit', number: 10, repo: 'test' });
  });
});
