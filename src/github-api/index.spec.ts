// github-api/index.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { getPRNumber } from './index.ts';

describe('github', async () => {
  it('getPRNumber', async () => {
    process.env['GITHUB_REF'] = '/ref/4/branch';
    assert.equal(getPRNumber(), '4');

    process.env['GITHUB_REF'] = '/ref/46/bra4nch';
    assert.equal(getPRNumber(), '46');

    process.env['GITHUB_REF'] = undefined;
    assert.throws(() => getPRNumber(), Error);
  });
});
