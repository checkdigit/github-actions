// github-api/index-context.spec.ts

import { strict as assert } from 'node:assert';
import os from 'node:os';
import path from 'node:path';

import { describe, it } from '@jest/globals';
import { v4 as uuid } from 'uuid';

import { createGithubEventFile, PR_NUMBER_DEFAULT } from '../nocks/github.test';
import { getPullRequestContext } from './index';

describe('github context', () => {
  it('no environment variable', async () => {
    process.env['GITHUB_EVENT_PATH'] = '';
    const result = await getPullRequestContext();
    assert.equal(result, undefined);
  });

  it('unable to open file - file does not exist', async () => {
    process.env['GITHUB_EVENT_PATH'] = path.join(os.tmpdir(), uuid());
    assert.equal(await getPullRequestContext(), undefined);
  });

  it('standard happy path', async () => {
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/test';
    process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile(PR_NUMBER_DEFAULT);
    assert.deepEqual(await getPullRequestContext(), { owner: 'checkdigit', number: PR_NUMBER_DEFAULT, repo: 'test' });
  });
});
