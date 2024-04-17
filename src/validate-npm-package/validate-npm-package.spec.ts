// validate-npm-package/validate-npm-package.spec.ts

import { strict as assert } from 'node:assert';

import { describe, it } from '@jest/globals';

import verifyNpmPackage from './validate-npm-package';

// // the following test works locally but fails in the CI because this is a public repo and the npm token is not available
// // eslint-disable-next-line jest/no-disabled-tests
describe('validate-npm-package', () => {
  it('successfully verify good npm package', async () => {
    await verifyNpmPackage('@checkdigit/approval@2.0.3');
  }, 120_000);

  it('bad npm package results in error', async () => {
    await assert.rejects(() => verifyNpmPackage('@checkdigit/approval@2.0.0-PR.196-b041`'));
  }, 120_000);
});