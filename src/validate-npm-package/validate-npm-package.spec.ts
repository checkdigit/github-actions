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

  it('successfully verify good beta npm package with the latest standards', async () => {
    actionsCoreSpy.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/test-checkdigit@3.4.1-PR.134-31bc';
      }
      return '';
    });

    await verifyNpmPackage();
  }, 300_000);

  // Test uses a bad version of approval package
  // and requires skipLibCheck: false in tsconfig.json
  // we set it manually in validate npm package as
  // checkdigit/typescript-config is various versions of this setting
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
