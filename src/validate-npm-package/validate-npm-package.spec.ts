// validate-npm-package/validate-npm-package.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it, mock } from 'node:test';

describe('validate-npm-package', async () => {
  const getInputMock = mock.fn<(name: string) => string>();
  mock.module('@actions/core', {
    // node:test added `exports` in Node 24.15.0. Node 26 also supports it.
    // `namedExports` is deprecated and fails with our --throw-deprecation flag.
    exports: {
      getInput: getInputMock,
    },
  });
  // must use dynamic import after mocking to ensure the mock is applied
  const { default: verifyNpmPackage } =
    await import('./validate-npm-package.ts');

  it('successfully verify good npm package', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name: string) => {
      if (name === 'betaPackage') {
        return '@checkdigit/hash@4.0.1';
      }
      return '';
    });

    await verifyNpmPackage();
  });

  it(
    'successfully verify good beta npm package with the latest standards',
    { timeout: 300_000 },
    async () => {
      getInputMock.mock.mockImplementationOnce((name) => {
        if (name === 'betaPackage') {
          return '@checkdigit/hash@5.0.0-PR.32-b512';
        }
        return '';
      });

      await verifyNpmPackage();
    },
  );

  it(
    'configuration only package that imports json directly should work',
    { timeout: 300_000 },
    async () => {
      getInputMock.mock.mockImplementationOnce((name) => {
        if (name === 'betaPackage') {
          return '@checkdigit/prettier-config@8.1.1';
        }
        return '';
      });

      await verifyNpmPackage();
    },
  );

  it(
    'package with peer dependencies should not have dependency conflicts',
    { timeout: 300_000 },
    async () => {
      getInputMock.mock.mockImplementationOnce((name) => {
        if (name === 'betaPackage') {
          return '@checkdigit/typescript-config@10.2.1';
        }
        return '';
      });

      await verifyNpmPackage();
    },
  );

  it(
    'package requiring a browser fails default import',
    { timeout: 300_000 },
    async () => {
      getInputMock.mock.mockImplementationOnce((name) => {
        if (name === 'betaPackage') {
          return 'keymaster@1.6.2';
        }
        return '';
      });

      await assert.rejects(
        () => verifyNpmPackage(),
        /document is not defined/u,
      );
    },
  );
});
