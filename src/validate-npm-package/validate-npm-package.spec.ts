// validate-npm-package/validate-npm-package.spec.ts

import { strict as assert } from 'node:assert';

import { afterEach, describe, it, jest } from '@jest/globals';
import core from '@actions/core';

import verifyNpmPackage from './validate-npm-package';

describe('validate-npm-package', () => {
  const actionsCoreSpy = jest.spyOn(core, 'getInput');

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('successfully verify good npm package', async () => {
    actionsCoreSpy.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/approval@2.0.3';
      }
      return '';
    });

    await verifyNpmPackage();
  }, 300_000);

  it('bad npm package results in error', async () => {
    actionsCoreSpy.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/approval@2.0.0-PR.196-b041';
      }
      return '';
    });
    await assert.rejects(() => verifyNpmPackage());
  }, 300_000);
});
