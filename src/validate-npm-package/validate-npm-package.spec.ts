// validate-npm-package/validate-npm-package.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it, mock } from 'node:test';

describe('validate-npm-package', async () => {
  const getInputMock = mock.fn<(name: string) => string>();
  mock.module('@actions/core', {
    namedExports: {
      getInput: getInputMock,
    },
  });
  // must use dynamic import after mocking to ensure the mock is applied
  const { default: verifyNpmPackage } = await import('./validate-npm-package.ts');

  it('successfully verify good npm package', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name: string) => {
      if (name === 'betaPackage') {
        return '@checkdigit/approval@2.0.3';
      }
      return '';
    });

    await verifyNpmPackage();
  });

  it('successfully verify good beta npm package with the latest standards', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/test-checkdigit@3.4.1-PR.134-31bc';
      }
      return '';
    });

    await verifyNpmPackage();
  });

  it('configuration only package that imports json directly should work', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/prettier-config@7.1.1';
      }
      return '';
    });

    await verifyNpmPackage();
  });

  it('service without serve-runtime should not have dependency conflicts', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/connector@4.0.2-PR.141-c066';
      }
      return '';
    });

    await verifyNpmPackage();
  });

  // Test uses a bad version of approval package
  // and requires skipLibCheck: false in tsconfig.json
  // we set it manually in validate npm package as
  // checkdigit/typescript-config is various versions of this setting
  it('bad npm package results in error', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/approval@2.0.0-PR.196-b041';
      }
      return '';
    });

    await assert.rejects(() => verifyNpmPackage(), Error);
  });
});
