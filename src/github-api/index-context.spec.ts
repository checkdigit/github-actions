// github-api/index-context.spec.ts

import { strict as assert } from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createGithubEventFile, PR_NUMBER_DEFAULT } from '../nocks/github.test.ts';
import { getPullRequestContext } from './index.ts';

describe('github context', async () => {
  it('no environment variable', async () => {
    process.env['GITHUB_EVENT_PATH'] = '';
    const result = await getPullRequestContext();
    assert.equal(result, undefined);
  });

  it('unable to open file - file does not exist', async () => {
    process.env['GITHUB_EVENT_PATH'] = path.join(os.tmpdir(), crypto.randomUUID());
    assert.equal(await getPullRequestContext(), undefined);
  });

  it('standard happy path', async () => {
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/test';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile(PR_NUMBER_DEFAULT);
    assert.deepEqual(await getPullRequestContext(), { owner: 'checkdigit', number: PR_NUMBER_DEFAULT, repo: 'test' });
  });
});
